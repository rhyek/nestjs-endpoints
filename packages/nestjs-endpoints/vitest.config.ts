import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: path.join(__dirname, '../..'),
    include: [path.join(__dirname, '**/*.spec.ts')],
  },
});
