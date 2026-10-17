#!/bin/bash
set -e
__dirname=$(realpath "$(dirname "$0")")

pnpm --filter "nestjs-endpoints" test run

pnpm --filter "./packages/test/*" exec rm -rf generated

# `test-app-express` is the canonical app: it owns every endpoint fixture and
# spec. The other adapter apps receive them by rsync, keeping only their own
# adapter-specific `create-app.ts`.
# `--delete` keeps the mirrors exact. Without it rsync only ever adds, so a
# file deleted or renamed in the canonical app lingers in the other apps and
# fails their `tscheck` long after the change that orphaned it.
pnpm --filter "./packages/test/*" --filter "!test-app-express" --filter "!test-react-query-client" exec sh -c "\
  rsync -ar --delete ../test-app-express/src/ ./src/ --exclude=.gitkeep && \
  rsync -ar --delete ../test-app-express/test/ ./test/ --exclude=create-app.ts
"

pnpm --filter "./packages/test/*" run codegen
pnpm -r run tscheck

pnpm --filter "test-app-*" run test:e2e --no-cache

# The built app, booted the way a consumer would, for the specs that call it
# over HTTP. `pnpm start` runs in its own process group (job control), and
# the EXIT trap kills that group however the script ends: a failing spec
# exits through `set -e` before any explicit stop, and would leave the
# server holding its port.
SERVER_PID=

stop_server() {
  [[ -n "$SERVER_PID" ]] || return 0
  # Get the process group ID and ensure it's a valid number before using it
  PGID=$(ps -o pgid= -p $SERVER_PID | tr -d ' ')
  if [[ -n "$PGID" && "$PGID" =~ ^[0-9]+$ ]]; then
    kill -9 -- -$PGID
  else
    # Fallback to killing just the server process if we can't get the group
    kill -9 $SERVER_PID 2>/dev/null || true
  fi
  wait $SERVER_PID 2>/dev/null || true
  SERVER_PID=
}
trap stop_server EXIT

start_server() {
  cd $__dirname/../packages/test/test-app-express
  # enable job control so we get a new process group for the server
  set -m
  pnpm start &
  SERVER_PID=$!
  set +m

  wget -qO- https://raw.githubusercontent.com/eficode/wait-for/v2.2.3/wait-for | sh -s -- http://localhost:3000/test/status --timeout=10 -- echo success
}

# Cover the real ESM runtime path rather than the bundler-resolved one the
# e2e suites exercise.
start_server
stop_server

start_server
cd $__dirname/../packages/test/test-react-query-client
pnpm test run
stop_server
