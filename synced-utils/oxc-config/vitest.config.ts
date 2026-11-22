import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    // `tree` is what `verbose` printed before Vitest 4 flattened it.
    reporters: ['tree'],
  },
});
