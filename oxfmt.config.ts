import { ignorePatterns, oxfmtConfig } from '@rhyek/oxc-config/oxfmt';
import { defineConfig } from 'oxfmt';

export default defineConfig({
  ...oxfmtConfig,
  ignorePatterns: [
    ...ignorePatterns,
    // Codegen output.
    '**/generated/**',
    // The project the journey suite copies, kept as `nest new` and TanStack's CLI wrote it.
    'packages/test/test-journey/assets/**',
    // Self-contained showcases, each its own workspace.
    'examples/**',
    // README, CHANGELOG and the docs are formatted by hand.
    '**/*.md',
  ],
});
