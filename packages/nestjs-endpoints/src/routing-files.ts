import fs from 'node:fs';
import path from 'node:path';

export const endpointFileRegex = /\bendpoint\.(js|ts|mjs|mts)$/;

export const routerModuleFileRegex = /\brouter\.module\.(js|ts|mjs|mts)$/;

/**
 * Most preferred first. When two files share a stem (`a.endpoint.ts` beside a
 * compiled `a.endpoint.js`), the TypeScript one is the source.
 */
const SOURCE_EXTENSIONS = ['.ts', '.mts', '.js', '.mjs'];

export function isRoutingFile(name: string): boolean {
  return endpointFileRegex.test(name) || routerModuleFileRegex.test(name);
}

export function stripExtension(file: string): string {
  const ext = path.extname(file);
  return ext ? file.slice(0, -ext.length) : file;
}

/**
 * Whether two paths name the same module, whatever their extensions: a file
 * can be named by its source (`.ts`) in one place and as it runs (`.js`) in
 * another.
 */
export function isSameModule(a: string, b: string): boolean {
  return stripExtension(a) === stripExtension(b);
}

/** Whether a router leaves the folder `name` alone. */
const isSkippedDirectory = (name: string) => name === 'node_modules' || name.startsWith('.');

/**
 * What a router sees in one folder, sorted by name: its sub-folders (`true`)
 * and its endpoint and router-module files (`false`). Empty when the folder
 * is not there. Directories are followed through symlinks.
 */
export function listRoutingEntries(dir: string): [name: string, isDirectory: boolean][] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const directories: string[] = [];
  const byStem = new Map<string, string>();
  for (const name of names) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(path.join(dir, name));
    } catch {
      // Dangling symlink, or deleted between readdir and stat.
      continue;
    }
    if (stat.isDirectory()) {
      if (!isSkippedDirectory(name)) {
        directories.push(name);
      }
    } else if (isRoutingFile(name)) {
      const stem = stripExtension(name);
      const current = byStem.get(stem);
      if (!current || extensionRank(name) < extensionRank(current)) {
        byStem.set(stem, name);
      }
    }
  }
  return [
    ...directories.map((name): [string, boolean] => [name, true]),
    ...[...byStem.values()].map((name): [string, boolean] => [name, false]),
  ].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Every endpoint and router-module file under `dir`, as POSIX paths relative
 * to it, sorted.
 *
 * `node_modules` and dot-directories are skipped. Directories are followed
 * through symlinks, as the router's own walk always has.
 */
export function scanRoutingFiles(dir: string): string[] {
  const files: string[] = [];
  const walk = (relDir: string) => {
    for (const [name, isDirectory] of listRoutingEntries(path.join(dir, relDir))) {
      const rel = relDir ? `${relDir}/${name}` : name;
      if (isDirectory) {
        walk(rel);
      } else {
        files.push(rel);
      }
    }
  };
  walk('');
  return files.sort();
}

function extensionRank(file: string): number {
  return SOURCE_EXTENSIONS.indexOf(path.extname(file));
}
