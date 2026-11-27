import { defineConfig } from 'vitest/config';
import { API_PORT } from './ports';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    globalSetup: ['./vitest.global-setup.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // Where the app is, for `App` and the specs, which read it from `import.meta.env`.
    env: { VITE_WEB_API_PORT: String(API_PORT) },
  },
});
