#!/bin/bash
set -e
__dirname=$(realpath "$(dirname "$0")")

pnpm --filter "nestjs-endpoints" test run

pnpm --filter "./packages/test/*" exec rm -rf generated

pnpm --filter "./packages/test/*" --filter "!test-app-express-cjs" --filter "!test-react-query-client" exec sh -c "\
  rsync -ar ../test-app-express-cjs/src/ ./src/ && \
  rsync -ar ../test-app-express-cjs/test/ ./test/ --exclude=create-app.ts
"

pnpm --filter "./packages/test/*" run codegen
pnpm -r run tscheck

pnpm --filter "test-app-*" run test:e2e --no-cache

# Function to test a specific module type (cjs or esm)
test_real_run() {
  local type=$1
  
  cd $__dirname/../packages/test/test-app-express-$type
  # enable job control so we get a new process group for the server
  set -m
  pnpm start &
  SERVER_PID=$!
  set +m

  wget -qO- https://raw.githubusercontent.com/eficode/wait-for/v2.2.3/wait-for | sh -s -- http://localhost:3000/test/status --timeout=10 -- echo $type success

  # Get the process group ID and ensure it's a valid number before using it
  PGID=$(ps -o pgid= -p $SERVER_PID | tr -d ' ')
  if [[ -n "$PGID" && "$PGID" =~ ^[0-9]+$ ]]; then
    kill -9 -- -$PGID
  else
    # Fallback to killing just the server process if we can't get the group
    kill -9 $SERVER_PID 2>/dev/null || true
  fi
  
  wait $SERVER_PID 2>/dev/null || true
}

# Test CJS module
test_real_run cjs

# Test ESM module
test_real_run esm

test_react_query_client() {
  cd $__dirname/../packages/test/test-app-express-cjs
  # enable job control so we get a new process group for the server

  set -m
  pnpm start &
  SERVER_PID=$!
  set +m

  wget -qO- https://raw.githubusercontent.com/eficode/wait-for/v2.2.3/wait-for | sh -s -- http://localhost:3000/test/status --timeout=10 -- echo $type success

  cd $__dirname/../packages/test/test-react-query-client
  pnpm test run

  # Get the process group ID and ensure it's a valid number before using it
  PGID=$(ps -o pgid= -p $SERVER_PID | tr -d ' ')
  if [[ -n "$PGID" && "$PGID" =~ ^[0-9]+$ ]]; then
    kill -9 -- -$PGID
  else
    # Fallback to killing just the server process if we can't get the group
    kill -9 $SERVER_PID 2>/dev/null || true
  fi
  
  wait $SERVER_PID 2>/dev/null || true
}
test_react_query_client
