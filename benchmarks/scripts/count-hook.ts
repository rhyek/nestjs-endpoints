// Preloaded into an app by `breakdown.ts` (`node --import`), never into a process that is timed:
// counts the promises, the other async resources and the RxJS subscriptions the process creates.
// On SIGUSR2 it prints what it counted since the last one, as a `COUNTS {...}` line on stderr.
import { createHook } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let counts: Record<string, number> = {};
const count = (key: string) => {
  counts[key] = (counts[key] ?? 0) + 1;
};

createHook({
  init(_id, type) {
    count(type);
  },
}).enable();

// The copy of rxjs NestJS itself loads: the app depends on the same one, and Node resolves it
// through the `node` condition of its export map for `import` and `require` alike.
const rxjsDir = fs.realpathSync(path.join(process.cwd(), 'node_modules/rxjs'));
const manifest = JSON.parse(fs.readFileSync(path.join(rxjsDir, 'package.json'), 'utf8')) as {
  exports: { '.': { node: string } };
};
const entry = path.join(rxjsDir, manifest.exports['.'].node);
const rxjs = (await import(pathToFileURL(entry).href)) as {
  Observable: { prototype: { subscribe: (...args: unknown[]) => unknown } };
};
const { subscribe } = rxjs.Observable.prototype;
rxjs.Observable.prototype.subscribe = function (...args) {
  count('subscription');
  return subscribe.apply(this, args);
};

process.on('SIGUSR2', () => {
  const counted = counts;
  counts = {};
  process.stderr.write(`COUNTS ${JSON.stringify(counted)}\n`);
});
