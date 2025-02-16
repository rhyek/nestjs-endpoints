#!/bin/bash
set -e
__dirname=$(dirname "$0")

cd "$__dirname/../packages/nestjs-endpoints"
pnpm run build
