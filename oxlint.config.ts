// Lint config for the repo: the shared rules of `@rhyek/oxc-config` (ESLint's and
// typescript-eslint's recommended sets carried over to oxlint, the bug-catching additions, and the
// React set for the react-query test client). Each shared rule, and why some are off, is written
// beside it in `synced-utils/oxc-config/src/oxlint.ts`. Formatting is oxfmt's (oxfmt.config.ts).
import { base, ignorePatterns, react } from '@rhyek/oxc-config/oxlint';
import { defineConfig } from 'oxlint';

export default defineConfig({
  extends: [base, react],
  env: { node: true },
  ignorePatterns: [
    ...ignorePatterns,
    // Codegen output: every test app has one, not just the examples.
    '**/generated/**',
    // Endpoint manifests: rewritten by the app as endpoint files come and go, so they stay in the
    // generator's own format.
    '**/endpoints.gen.ts',
    // Self-contained showcases, each its own workspace with its own install.
    'examples/**',
  ],
  rules: {
    // Only the library is kept off the console (override below): the test apps and scripts log.
    'eslint/no-console': 'off',
  },
  overrides: [
    {
      files: ['packages/nestjs-endpoints/**'],
      rules: {
        'eslint/no-console': 'error',
        // The public types are generic plumbing: `EndpointResponse<Status = any, Body = any>`,
        // conditional types that resolve to `any`. `unknown` there would change what consumers'
        // code type-checks against.
        'typescript/no-explicit-any': 'off',
      },
    },
    {
      // The `nestjs-endpoints` bin is the one place in the package that is supposed to talk to a
      // terminal.
      files: ['packages/nestjs-endpoints/src/cli.ts'],
      rules: { 'eslint/no-console': 'off' },
    },
    {
      // The library keeps its renamed APIs as deprecated aliases, and the specs and test apps
      // exercise them to keep them working.
      files: ['**/*.spec.ts', '**/*.spec.tsx', 'packages/test/**'],
      rules: { 'typescript/no-deprecated': 'off' },
    },
    {
      // A browser app under jsdom, with vitest's globals.
      files: ['packages/test/test-react-query-client/**'],
      env: { browser: true, vitest: true },
    },
  ],
});
