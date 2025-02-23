#!/bin/bash
set -e
__dirname=$(dirname "$0")

pnpm --filter "./packages/test-endpoints-module/*" --filter "!test-app-express-cjs" exec sh -c "\
  cp -r ../test-app-express-cjs/src/* ./src/ && \
  cp ../test-app-express-cjs/test/jest-e2e.json ../test-app-express-cjs/test/app.e2e-spec.ts ./test/ \
"

pnpm --filter "./packages/test-endpoints-router-module/*" --filter "!test-app-router-module-express-cjs" exec sh -c "\
  cp -r ../test-app-express-cjs/src/* ./src/ && \
  cp ../test-app-express-cjs/test/jest-e2e.json ../test-app-express-cjs/test/app.e2e-spec.ts ./test/ \
"

pnpm --filter "test-app-*" run test:e2e --no-cache
