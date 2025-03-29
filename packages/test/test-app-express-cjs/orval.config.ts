import { defineConfig } from 'orval';

export default defineConfig({
  test: {
    output: {
      workspace: 'generated',
      target: 'client.ts',
      client: 'axios-functions',
      mode: 'single',
      indexFiles: false,
      override: {
        mutator: {
          path: './custom-axios-instance.ts',
          name: 'customInstance',
        },
      },
    },
    input: {
      target: './openapi.json',
    },
    hooks: {
      afterAllFilesWrite: 'pnpm eslint --fix',
    },
  },
});
