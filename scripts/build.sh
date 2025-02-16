#!/bin/bash
set -e
__dirname=$(dirname "$0")

cd "$__dirname/../packages/nestjs-endpoints"
rm -rf dist
pnpm tsc --project tsconfig.cjs.json
echo '{"type": "commonjs"}' > dist/cjs/package.json
pnpm tsc --project tsconfig.esm.json && pnpm tsc-alias --project tsconfig.esm.json
echo '{"type": "module"}' > dist/esm/package.json
