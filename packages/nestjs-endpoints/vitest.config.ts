import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: path.join(import.meta.dirname, '../..'),
    include: [path.join(import.meta.dirname, '**/*.spec.ts')],
  },
});
