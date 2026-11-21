import { linkTypescriptWithApi } from './installed-project';
import { NEST } from './nest-project';
import { describeRouting } from './routing-scenarios';

// The Nest CLI compiles the app into `dist/` and runs that. Its watcher compiles a new file and
// restarts the app by itself, and leaves a deleted file's output in `dist/`, which the router
// tells from its source being gone.
describeRouting({
  name: 'nest start',
  once: [NEST, 'start'],
  watch: { name: 'nest start --watch', args: [NEST, 'start', '--watch'] },
  restartsForNewFiles: true,
  prepare: linkTypescriptWithApi,
});
