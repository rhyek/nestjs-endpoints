import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.spec.ts'],
    // Vitest processes nestjs-endpoints, so that the endpoint files it loads go through Vite
    // like the rest of the app.
    server: { deps: { inline: ['nestjs-endpoints'] } },
  },
});
