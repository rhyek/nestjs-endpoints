import { copyPackage, linkPackage, linkTypescriptWithApi } from './installed-project';
import { describeRouting } from './routing-scenarios';

const node = ['--import', '@swc-node/register/esm-register'];

// Node with SWC's loader, which compiles TypeScript as it is imported.
describeRouting({
  name: 'node and the SWC loader',
  once: [...node, 'src/main.ts'],
  watch: {
    name: 'node --watch and the SWC loader',
    args: [...node, '--watch', '--watch-preserve-output', 'src/main.ts'],
  },
  restartsForNewFiles: false,
  async prepare(directory) {
    // The loader reads the tsconfig through TypeScript's compiler API, and takes the
    // project's TypeScript for it.
    await copyPackage(directory, '@swc-node/register');
    await linkPackage(directory, '@swc/core');
    await linkTypescriptWithApi(directory);
  },
});
