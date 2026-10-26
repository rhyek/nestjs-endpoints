import fs from 'node:fs';
import path from 'node:path';
import { endpointFileRegex, routerModuleFileRegex } from '../consts.js';

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
 * Whether two paths name the same module: a manifest's keys carry source
 * extensions while a compiled app runs `.js` files.
 */
export function isSameModule(a: string, b: string): boolean {
  return stripExtension(a) === stripExtension(b);
}

/**
 * Every endpoint and router-module file under `dir`, as POSIX paths relative
 * to it, sorted. These are the keys of an endpoint manifest.
 *
 * `node_modules` and dot-directories are skipped. Directories are followed
 * through symlinks, as the router's own walk always has.
 */
export function scanRoutingFiles(dir: string): string[] {
  const byStem = new Map<string, string>();
  const walk = (relDir: string) => {
    let names: string[];
    try {
      names = fs.readdirSync(path.join(dir, relDir));
    } catch {
      return;
    }
    for (const name of names) {
      const rel = relDir ? `${relDir}/${name}` : name;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(path.join(dir, rel));
      } catch {
        // Dangling symlink, or deleted between readdir and stat.
        continue;
      }
      if (stat.isDirectory()) {
        if (name !== 'node_modules' && !name.startsWith('.')) {
          walk(rel);
        }
      } else if (isRoutingFile(name)) {
        const stem = stripExtension(rel);
        const current = byStem.get(stem);
        if (!current || extensionRank(rel) < extensionRank(current)) {
          byStem.set(stem, rel);
        }
      }
    }
  };
  walk('');
  return [...byStem.values()].sort();
}

function extensionRank(file: string): number {
  return SOURCE_EXTENSIONS.indexOf(path.extname(file));
}
