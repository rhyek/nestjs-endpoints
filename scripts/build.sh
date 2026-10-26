#!/bin/bash
set -e
__dirname=$(realpath "$(dirname "$0")")

cd "$__dirname/../packages/nestjs-endpoints"
rm -rf dist
pnpm tsc --project tsconfig.build.json
