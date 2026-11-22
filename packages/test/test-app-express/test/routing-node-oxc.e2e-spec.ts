import { linkPackage } from './installed-project';
import { describeRouting } from './routing-scenarios';

const node = ['--import', '@oxc-node/core/register'];

// Node with oxc's loader, which compiles TypeScript as it is imported: how the test apps
// themselves are run.
describeRouting({
  name: 'node and the oxc loader',
  once: [...node, 'src/main.ts'],
  watch: {
    name: 'node --watch and the oxc loader',
    args: [...node, '--watch', '--watch-preserve-output', 'src/main.ts'],
  },
  restartsForNewFiles: false,
  async prepare(directory) {
    await linkPackage(directory, '@oxc-node/core');
  },
});
