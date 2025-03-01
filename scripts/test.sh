#!/bin/bash
set -e
__dirname=$(realpath "$(dirname "$0")")

pnpm --filter "./packages/test-endpoints-module/test-app-express-cjs" run codegen

pnpm --filter "./packages/test-endpoints-module/*" --filter "!test-app-express-cjs" exec sh -c "\
  rsync -ar ../test-app-express-cjs/src/ ./src/ && \
  rsync -ar ../test-app-express-cjs/generated/ ./generated/ && \
  rsync -ar ../test-app-express-cjs/test/ ./test/ --exclude=create-app.ts
"

pnpm --filter "./packages/test-endpoints-router-module/*" --filter "!test-app-router-module-express-cjs" exec sh -c "\
  rsync -ar ../test-app-express-cjs/src/ ./src/
"

pnpm --filter "./packages/test-endpoints-router-module/*" exec sh -c "\
  rsync -ar ../../test-endpoints-module/test-app-express-cjs/generated/ ./generated/ && \
  rsync -ar ../../test-endpoints-module/test-app-express-cjs/test/ ./test/ --exclude=create-app.ts
"

pnpm --filter "test-app-*" run test:e2e --no-cache

# Function to test a specific module type (cjs or esm)
test_real_run() {
  local type=$1
  
  cd $__dirname/../packages/test-endpoints-router-module/test-app-express-$type
  # enable job control so we get a new process group for the server
  set -m
  pnpm start &
  set +m
  SERVER_PID=$!

  wget -qO- https://raw.githubusercontent.com/eficode/wait-for/v2.2.3/wait-for | sh -s -- http://localhost:3000/test/status --timeout=5 -- echo $type success

  kill -9 -- -$(ps -o pgid= -p $SERVER_PID)
  wait $SERVER_PID 2>/dev/null || true
}

# Test CJS module
test_real_run cjs

# Test ESM module
test_real_run esm
