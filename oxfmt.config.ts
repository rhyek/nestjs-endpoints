import { ignorePatterns, oxfmtConfig } from '@rhyek/oxc-config/oxfmt';
import { defineConfig } from 'oxfmt';

export default defineConfig({
  ...oxfmtConfig,
  ignorePatterns: [
    ...ignorePatterns,
    // Codegen output.
    '**/generated/**',
    // Endpoint manifests stay in the generator's own format.
    '**/endpoints.gen.ts',
    // Self-contained showcases, each its own workspace.
    'examples/**',
    // README, CHANGELOG and the docs are formatted by hand.
    '**/*.md',
  ],
});
