#!/bin/bash
set -e
__dirname=$(realpath "$(dirname "$0")")

cd "$__dirname/../packages/nestjs-endpoints"
rm -rf dist
pnpm tsc --project tsconfig.cjs.json
echo '{"type": "commonjs"}' > dist/cjs/package.json
pnpm tsc --project tsconfig.esm.json && pnpm tsc-alias --project tsconfig.esm.json
echo '{"type": "module"}' > dist/esm/package.json
# Modify the ESM router-module.js to use dynamic import instead of require
if [[ "$OSTYPE" == "darwin"* ]]; then
    SED_OPTS="-i ''"
else
    SED_OPTS="-i"
fi
sed $SED_OPTS 's/require(f).default/await import(f).then((m) => m.default)/g' dist/esm/router-module.js
