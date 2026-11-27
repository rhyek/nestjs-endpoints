import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { logger } from './logger';
import { isSkippedDirectory, scanRoutingFiles } from './routing-files';

const DEBOUNCE_MS = 100;

/**
 * How long a file this module has just created is left before the app imports it, which is
 * when `node --watch` starts to watch it. macOS reports a file created in the moments before
 * that as changed, and the app would restart on the first run of a project. Measured on 20
 * such runs: 17 restarted with no pause, and none of 12 with 150 ms.
 */
const SETTLE_MS = 300;

/** One per cache file: a second call for the same app must not stack watchers. */
const watchers = new Map<string, { close(): void }>();

/** The cache folders already reported as not writable: once per app, not once per router. */
const warned = new Set<string>();

/**
 * Makes `node --watch` restart the app when an endpoint or router-module file
 * is added to, or removed from, `directories`. `node --watch` restarts when a
 * file the process imported changes, and never notices a file nothing imports
 * yet. So the app imports one file of its own, which lists its routing files,
 * and rewrites it when that list changes.
 *
 * Each router has a file of its own, under the `node_modules/.cache` nearest to
 * `near`, the file that created the router. Where it cannot be written, the
 * app carries on: a new endpoint file is then served after a manual restart.
 */
export async function watchRoutingFiles(opts: {
  directories: string[];
  near: string;
}): Promise<void> {
  const cacheFile = cacheFileFor(opts.near, opts.directories);
  if (!cacheFile) {
    warnNotWritable(path.join('node_modules', '.cache', 'nestjs-endpoints'));
    return;
  }
  if (watchers.has(cacheFile)) {
    return;
  }
  // Before anything is awaited: an app starts its routers at once.
  watchers.set(cacheFile, { close: () => {} });
  const list = () =>
    opts.directories
      .flatMap((dir) => scanRoutingFiles(dir).map((file) => path.join(dir, file)))
      .sort();
  let current = render(list());
  let created = false;
  try {
    // A file an earlier run left is used as it is, whatever it lists: only a change to it
    // matters, and writing it now, moments before `node --watch` starts to watch it, can be
    // reported as a change and restart the app that has just started.
    if (fs.existsSync(cacheFile)) {
      fs.accessSync(path.dirname(cacheFile), fs.constants.W_OK);
    } else {
      write(cacheFile, current);
      created = true;
    }
  } catch {
    watchers.delete(cacheFile);
    warnNotWritable(path.dirname(cacheFile));
    return;
  }
  try {
    if (created) {
      await sleep(SETTLE_MS);
    }
    // What puts the file among those `node --watch` restarts for.
    await import(pathToFileURL(cacheFile).href);
  } catch (error) {
    // A later app in the process starts afresh.
    watchers.delete(cacheFile);
    throw error;
  }

  let timer: NodeJS.Timeout | undefined;
  const rescan = () => {
    const next = render(list());
    if (next !== current) {
      current = next;
      try {
        write(cacheFile, next);
      } catch {
        // The folder was writable a moment ago: nothing useful to add.
      }
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(rescan, DEBOUNCE_MS);
    timer.unref();
  };
  const fsWatchers: fs.FSWatcher[] = [];
  const close = () => {
    clearTimeout(timer);
    for (const watcher of fsWatchers) {
      watcher.close();
    }
    watchers.delete(cacheFile);
  };
  for (const dir of opts.directories) {
    // A folder that is not there yet is watched from the nearest folder above it that is: the
    // app has to learn of the first endpoint file of a new project too.
    const watched = nearestExisting(dir);
    try {
      // Any event triggers a rescan: a renamed or deleted folder can arrive as one event that
      // names only the folder, and a folder's name can look like a file's (`$id.view`). The
      // rescan is cheap, and nothing is written unless the list changed.
      const watcher = fs.watch(watched, { recursive: true }, (_event, filename) => {
        if (watched === dir || !filename || !isOutsideTheApp(filename)) {
          schedule();
        }
      });
      watcher.on('error', close);
      // The watcher must never be what keeps the process alive.
      watcher.unref();
      fsWatchers.push(watcher);
    } catch {
      // Nothing to watch: a new endpoint file is served after a manual restart.
    }
  }
  watchers.set(cacheFile, { close });
  // Covers changes made between the scan above and the watchers going live.
  schedule();
}

/** For tests: closes every watcher, and forgets which warnings were given. */
export function closeRoutingFileWatchers(): void {
  for (const watcher of watchers.values()) {
    watcher.close();
  }
  watchers.clear();
  warned.clear();
}

function warnNotWritable(shown: string): void {
  if (!warned.has(shown)) {
    warned.add(shown);
    logger.warn(
      `watch is on, but ${shown} cannot be written, so a new endpoint file needs a manual restart.`,
    );
  }
}

/** `dir`, or the nearest folder above it that exists. */
function nearestExisting(dir: string): string {
  let current = dir;
  while (!fs.existsSync(current) && current !== path.dirname(current)) {
    current = path.dirname(current);
  }
  return current;
}

/**
 * Whether a change reported from a folder above the router's own is one to pass over: in a
 * folder a router leaves alone. This module's own file is among them.
 */
function isOutsideTheApp(filename: string): boolean {
  return filename.split(/[\\/]/).some(isSkippedDirectory);
}

/** `<nearest node_modules>/.cache/nestjs-endpoints/<id of the router>.mjs`. */
function cacheFileFor(near: string, directories: readonly string[]): string | undefined {
  for (let dir = path.dirname(near); ; dir = path.dirname(dir)) {
    const modules = path.join(dir, 'node_modules');
    if (fs.statSync(modules, { throwIfNoEntry: false })?.isDirectory()) {
      const id = crypto
        .createHash('sha1')
        .update([near, ...directories].join('\0'))
        .digest('hex')
        .slice(0, 12);
      return path.join(modules, '.cache', 'nestjs-endpoints', `${id}.mjs`);
    }
    if (dir === path.dirname(dir)) {
      return undefined;
    }
  }
}

function render(files: readonly string[]): string {
  return [
    '// Written by nestjs-endpoints: the endpoint files of a router, in an app that runs with `watch` on.',
    '// The app imports this file, so that `node --watch` restarts it when the list changes.',
    `export default ${JSON.stringify(files, null, 2)};`,
    '',
  ].join('\n');
}

/** Writes the file whole, by renaming a temporary one: `node --watch` never reads half of it. */
function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, content);
  try {
    fs.renameSync(temp, file);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw error;
  }
}
