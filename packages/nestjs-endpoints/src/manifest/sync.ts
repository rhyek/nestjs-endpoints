import fs from 'node:fs';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { writeManifest } from './file.js';
import { ImportExtension } from './render.js';
import { scanRoutingFiles } from './scan.js';
import { locateSourceManifest } from './source.js';

/**
 * - `off`: production. The manifest is trusted; the source tree may not even
 *   be there.
 * - `check`: CI. A stale manifest is an error; nothing is written.
 * - `write`: everything else (development, local test runs). A stale manifest
 *   is rewritten.
 */
type SyncMode = 'off' | 'check' | 'write';

const WATCH_DEBOUNCE_MS = 100;

const logger = new Logger('nestjs-endpoints');

/** One per source manifest: a re-registration must not stack watchers. */
const watchers = new Map<string, { close(): void }>();

export function syncMode(env: NodeJS.ProcessEnv): SyncMode {
  if (env.NODE_ENV === 'production') return 'off';
  if (env.CI && env.CI !== 'false' && env.CI !== '0') return 'check';
  return 'write';
}

/**
 * Brings the manifest's source file in line with the source tree, and returns
 * the keys this process may load: those the running manifest declares that
 * still exist in the source tree. Filtering against the source tree, not the
 * running directory, matters for compiled apps — `tsc` leaves a deleted
 * endpoint's `.js` behind in `dist/`.
 *
 * Files added since the manifest was loaded cannot be loaded by this process;
 * rewriting the manifest restarts it under `node --watch` / `tsx watch`.
 */
export function syncManifest(
  runningFile: string,
  declaredKeys: readonly string[],
  importExtension: ImportExtension,
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const mode = syncMode(env);
  if (mode === 'off') {
    return declaredKeys;
  }
  const sourceFile = locateSourceManifest(runningFile);
  if (!sourceFile) {
    logger.warn(
      `Cannot find the source of ${displayPath(runningFile)} (no source map?), so it is not kept in sync. Regenerate it with \`npx nestjs-endpoints generate\` after adding or removing endpoint files.`,
    );
    return declaredKeys;
  }
  const scanned = scanRoutingFiles(path.dirname(sourceFile));
  const diff = diffKeys(declaredKeys, scanned);
  if (diff) {
    if (mode === 'check') {
      throw new Error(staleMessage(sourceFile, diff));
    }
    const current = tryWrite(sourceFile, scanned, importExtension, diff);
    // A test run cannot load what its manifest did not list, and later test
    // files would load the rewritten one: fail clearly rather than let the
    // first file's 404s look like flakiness.
    if (current && diff.added.length && env.NODE_ENV === 'test') {
      throw new Error(rerunMessage(sourceFile, diff));
    }
  }
  if (!env.NODE_ENV || env.NODE_ENV === 'development') {
    watchSourceTree(sourceFile, scanned, importExtension);
  }
  const present = new Set(scanned);
  return diff
    ? declaredKeys.filter((key) => present.has(key))
    : declaredKeys;
}

interface KeyDiff {
  added: string[];
  removed: string[];
}

function diffKeys(
  before: readonly string[],
  after: readonly string[],
): KeyDiff | undefined {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added = after.filter((key) => !beforeSet.has(key));
  const removed = before.filter((key) => !afterSet.has(key));
  return added.length || removed.length ? { added, removed } : undefined;
}

function formatDiff({ added, removed }: KeyDiff): string {
  return [
    ...added.map((key) => `  + ${key}`),
    ...removed.map((key) => `  - ${key}`),
  ].join('\n');
}

function staleMessage(sourceFile: string, diff: KeyDiff): string {
  return [
    `nestjs-endpoints: ${displayPath(sourceFile)} is out of date with the endpoint files beside it:`,
    formatDiff(diff),
    'Regenerate it with `npx nestjs-endpoints generate` (or by starting the app once in development) and commit it.',
  ].join('\n');
}

function rerunMessage(sourceFile: string, diff: KeyDiff): string {
  return [
    `nestjs-endpoints: ${displayPath(sourceFile)} was out of date and has been regenerated:`,
    formatDiff(diff),
    'This run loaded the previous version, which cannot serve the added endpoints. Run the tests again.',
  ].join('\n');
}

/**
 * Returns whether the source manifest is current afterwards. Never fatal: a
 * read-only or locked source tree (a deploy that does not set
 * `NODE_ENV=production`, a container) must not stop the app.
 */
function tryWrite(
  sourceFile: string,
  keys: readonly string[],
  importExtension: ImportExtension,
  diff: KeyDiff,
): boolean {
  let written: boolean;
  try {
    written = writeManifest(sourceFile, keys, importExtension);
  } catch (error) {
    logger.warn(
      `${displayPath(sourceFile)} is out of date but could not be rewritten (${(error as Error).message}):\n${formatDiff(diff)}`,
    );
    return false;
  }
  if (!written) {
    // The source manifest is current; only the running (compiled) copy lags.
    return true;
  }
  logger.log(
    `Updated ${displayPath(sourceFile)}:\n${formatDiff(diff)}${
      diff.added.length
        ? '\nAdded endpoints are served after a restart, which --watch does on its own.'
        : ''
    }`,
  );
  return true;
}

/**
 * Rescans on any change under the manifest's directory and rewrites the
 * manifest when the set of routing files changed. Any event triggers a full
 * rescan, because a renamed or deleted directory can arrive as a single event
 * naming only the directory.
 */
function watchSourceTree(
  sourceFile: string,
  initialKeys: readonly string[],
  importExtension: ImportExtension,
): void {
  if (watchers.has(sourceFile)) {
    return;
  }
  const dir = path.dirname(sourceFile);
  let current = initialKeys;
  let timer: NodeJS.Timeout | undefined;
  const rescan = () => {
    const scanned = scanRoutingFiles(dir);
    const diff = diffKeys(current, scanned);
    if (diff) {
      current = scanned;
      tryWrite(sourceFile, scanned, importExtension, diff);
    }
  };
  const scheduleRescan = () => {
    clearTimeout(timer);
    timer = setTimeout(rescan, WATCH_DEBOUNCE_MS);
    timer.unref();
  };
  let watcher: fs.FSWatcher;
  try {
    watcher = fs.watch(dir, { recursive: true }, (_event, filename) => {
      if (!filename || !isIgnored(filename, path.basename(sourceFile))) {
        scheduleRescan();
      }
    });
  } catch (error) {
    logger.warn(
      `Cannot watch ${displayPath(dir)} (${(error as Error).message}); restart the app after adding or removing endpoint files.`,
    );
    return;
  }
  const close = () => {
    clearTimeout(timer);
    watcher.close();
    watchers.delete(sourceFile);
  };
  watcher.on('error', close);
  // The watcher must never be what keeps the process alive.
  watcher.unref();
  watchers.set(sourceFile, { close });
  // Covers changes made between the startup scan and the watcher going live,
  // which the watcher itself does not report.
  scheduleRescan();
}

/** The manifest itself (and its temp files), dot-paths and `node_modules`. */
function isIgnored(filename: string, manifestName: string): boolean {
  const segments = filename.split(/[\\/]/);
  const base = segments[segments.length - 1];
  return (
    base === manifestName ||
    segments.some((s) => s.startsWith('.') || s === 'node_modules')
  );
}

/** Stops every watcher. For tests. */
export function closeManifestWatchers(): void {
  for (const watcher of [...watchers.values()]) {
    watcher.close();
  }
}

function displayPath(file: string): string {
  return path.relative(process.cwd(), file) || file;
}
