#!/bin/bash
set -e
__dirname=$(dirname "$0")

pnpm --filter "./packages/test-endpoints-module/test-app-express-cjs" run codegen

pnpm --filter "./packages/test-endpoints-module/*" --filter "!test-app-express-cjs" exec sh -c "\
  rsync -avr ../test-app-express-cjs/src/ ./src/ && \
  rsync -avr ../test-app-express-cjs/generated/ ./generated/ && \
  rsync -avr ../test-app-express-cjs/test/ ./test/ --exclude=create-app.ts
"

pnpm --filter "./packages/test-endpoints-router-module/*" --filter "!test-app-router-module-express-cjs" exec sh -c "\
  rsync -avr ../test-app-express-cjs/src/ ./src/
"

pnpm --filter "./packages/test-endpoints-router-module/*" exec sh -c "\
  rsync -avr ../../test-endpoints-module/test-app-express-cjs/generated/ ./generated/ && \
  rsync -avr ../../test-endpoints-module/test-app-express-cjs/test/ ./test/ --exclude=create-app.ts
"

pnpm --filter "test-app-*" run test:e2e --no-cache
