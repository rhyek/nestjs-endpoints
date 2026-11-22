// The package's `postinstall` entry. Plain JavaScript on purpose: Node refuses to strip types from
// anything under node_modules, so a `.ts` file can't run once the package is installed. The work
// is in `dist/postinstall.js` (compiled from `src/postinstall.ts`); this only makes sure an
// install never fails on its account: `dist` is absent while the package's own workspace
// installs, before its first build, and a lifecycle script that throws fails the whole install.
import('./dist/postinstall.js').then((m) => m.main()).catch(() => {});
