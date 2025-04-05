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
sed -i.bak 's/require(f).default/await import(f).then((m) => m.default)/g' dist/esm/endpoints-router.module.js
rm -f dist/esm/endpoints-router.module.js.bak
# Modify the ESM codegen/setup.js to use import.meta.dirname instead of __dirname
sed -i.bak 's/__dirname/import.meta.dirname/g' dist/esm/codegen/setup.js
rm -f dist/esm/codegen/setup.js.bak
