#!/bin/bash
set -e
__dirname=$(dirname "$0")

pnpm --filter "test-app-*" --filter "!test-app-express-cjs" exec sh -c "\
  cp ../test-app-express-cjs/src/app.module.ts ../test-app-express-cjs/src/auth.guard.ts ./src/ && \
  cp -r ../test-app-express-cjs/src/decorators ./src/ && \
  cp -r ../test-app-express-cjs/src/user ./src/ && \
  cp -r ../test-app-express-cjs/src/test ./src/ && \
  cp ../test-app-express-cjs/test/jest-e2e.json ../test-app-express-cjs/test/app.e2e-spec.ts ./test/ \
"

pnpm --filter "test-app-*" run test:e2e --no-cache
