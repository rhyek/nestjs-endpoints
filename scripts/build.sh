#!/bin/bash
set -e
__dirname=$(realpath "$(dirname "$0")")

# tsdown (packages/nestjs-endpoints/tsdown.config.ts) cleans `dist/` before it writes it.
cd "$__dirname/../packages/nestjs-endpoints"
pnpm tsdown
