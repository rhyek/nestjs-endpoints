import path from 'path';
import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: path.resolve(__dirname, '../../../'),
    include: [`${path.resolve(__dirname, 'test')}/**/*.e2e-spec.ts`],
  },
  plugins: [
    // This is required to build the test files with SWC
    swc.vite({
      // Explicitly set the module type to avoid inheriting this value from a `.swcrc` config file
      module: { type: 'es6' },
    }) as any,
    tsconfigPaths(),
  ],
});
