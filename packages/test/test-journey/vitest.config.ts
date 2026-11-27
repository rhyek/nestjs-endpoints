import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    // One project, two dev servers and a browser, on fixed ports: one spec at a time.
    fileParallelism: false,
    // The steps are one story: once one fails, the rest have nothing to stand on.
    bail: 1,
    // A step installs packages, or waits for a compiler and an app to restart.
    testTimeout: 180_000,
    hookTimeout: 300_000,
  },
});
