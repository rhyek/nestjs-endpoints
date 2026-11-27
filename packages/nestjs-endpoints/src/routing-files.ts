import fs from 'node:fs';
import path from 'node:path';
import { sourceGoneFilter } from './compiled-source';

const endpointFileRegex = /\bendpoint\.(js|ts|mjs|mts)$/;

/** A router's file, by its name: `router.ts`, or `router.module.ts`. */
export const routerFileRegex = /(^router|\brouter\.module)\.(js|ts|mjs|mts)$/;

/**
 * Which of a folder's router-named files is asked about first: `router.ts`, then
 * `router.module.ts`, then one named as `shop.router.module.ts`.
 */
function routerNameRank(file: string): number {
  const name = stripExtension(path.basename(file));
  return name === 'router' ? 0 : name === 'router.module' ? 1 : 2;
}

/**
 * Most preferred first. When two files share a stem (`a.endpoint.ts` beside a
 * compiled `a.endpoint.js`), the TypeScript one is the source.
 */
const SOURCE_EXTENSIONS = ['.ts', '.mts', '.js', '.mjs'];

function isRoutingFile(name: string): boolean {
  return endpointFileRegex.test(name) || routerFileRegex.test(name);
}

/** A file as an error message names it: from the working directory. */
export function shown(file: string): string {
  return path.relative(process.cwd(), file);
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

/** Whether a router leaves the folder `name` alone: packages, and dot-folders such as `.git`. */
export const isSkippedDirectory = (name: string) => name === 'node_modules' || name.startsWith('.');

/**
 * What a router sees in one folder, sorted by name: its sub-folders (`true`)
 * and its endpoint and router-module files (`false`). Empty when the folder
 * is not there. Directories are followed through symlinks.
 */
function listRoutingEntries(dir: string): [name: string, isDirectory: boolean][] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const directories: string[] = [];
  const byStem = new Map<string, string>();
  for (const entry of entries) {
    const { name } = entry;
    let isDirectory = entry.isDirectory();
    // Only a symlink needs a stat: to what it points to.
    if (entry.isSymbolicLink()) {
      try {
        isDirectory = fs.statSync(path.join(dir, name)).isDirectory();
      } catch {
        // Dangling symlink, or deleted since the folder was read.
        continue;
      }
    }
    if (isDirectory) {
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
 * What a router imports from its `directories`, walked where the app runs: the
 * source tree under a TypeScript loader or Vitest, the compiled output
 * otherwise. A compiled file whose source file was deleted is left out.
 *
 * A folder with a router file that exports a router, which `exportsRouter`
 * tells, is a nested router, at any depth: its router file is listed, and the
 * folder is not walked further. A file with a router file's name that exports
 * none is no router file, and its folder is walked as any other. The only
 * exception is `routerFile`'s own folder, which a `rootDirectory` entry may
 * name: a router does not register itself, and no other file there is its.
 *
 * The files of a folder are asked about in turn, `router.ts` first (see
 * `routerNameRank`), until one is a router; those after it are not loaded. Of
 * two with the same rank, both are asked about, and both being routers fails.
 * The files no router is taken from are `passedOver`.
 *
 * `mayBeRouter` is told every file that has the name, before any is asked
 * about: a nested router that registers while this walk waits finds itself
 * named.
 */
export async function findRouterFiles(
  directories: readonly string[],
  routerFile: string,
  exportsRouter: (file: string) => Promise<boolean>,
  mayBeRouter: (file: string) => void = () => {},
) {
  const endpointFiles = new Set<string>();
  const nestedRouterModuleFiles = new Set<string>();
  const passedOver = new Set<string>();
  const isSourceGone = sourceGoneFilter(routerFile);
  type Entries = ReturnType<typeof listRoutingEntries>;
  /** The folders with a file that may be a router's, each to be asked about. */
  const undecided: { dir: string; entries: Entries; named: string[] }[] = [];
  const walk = (dir: string) => {
    const entries = listRoutingEntries(dir).filter(
      ([name, isDirectory]) => isDirectory || !isSourceGone(path.join(dir, name)),
    );
    const named = entries
      .filter(([name, isDirectory]) => !isDirectory && routerFileRegex.test(name))
      .map(([name]) => path.join(dir, name));
    if (named.some((file) => !isSameModule(file, routerFile))) {
      for (const file of named) {
        if (!isSameModule(file, routerFile)) {
          mayBeRouter(file);
        }
      }
      undecided.push({ dir, entries, named });
    } else {
      walkInto(dir, entries);
    }
  };
  const walkInto = (dir: string, entries: Entries) => {
    for (const [name, isDirectory] of entries) {
      const file = path.join(dir, name);
      if (isDirectory) {
        walk(file);
      } else if (endpointFileRegex.test(name)) {
        endpointFiles.add(file);
      }
    }
  };
  for (const dir of directories) {
    walk(dir);
  }
  for (let folder = undecided.shift(); folder; folder = undecided.shift()) {
    const routers: string[] = [];
    const own = folder.named.find((file) => isSameModule(file, routerFile));
    if (own) {
      routers.push(own);
    }
    const ranks = [...new Set(folder.named.map(routerNameRank))].sort((a, b) => a - b);
    for (const rank of own ? [] : ranks) {
      for (const file of folder.named.filter((f) => routerNameRank(f) === rank)) {
        if (await exportsRouter(file)) {
          routers.push(file);
        }
      }
      if (routers.length > 0) {
        break;
      }
    }
    for (const file of folder.named) {
      if (!routers.includes(file)) {
        passedOver.add(file);
      }
    }
    if (routers.length > 1) {
      throw new Error(
        `${shown(folder.dir)} has both ${routers.map((file) => path.basename(file)).join(' and ')}. ` +
          'A folder has one router file: keep one of them. If one is left from a build, ' +
          "delete the build's output folder.",
      );
    }
    const [router] = routers;
    if (router && !isSameModule(router, routerFile)) {
      nestedRouterModuleFiles.add(router);
    } else {
      // No router's but the one walking: a folder as any other.
      walkInto(folder.dir, folder.entries);
    }
  }
  return { endpointFiles, nestedRouterModuleFiles, passedOver };
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
