import fs from 'node:fs';
import path from 'node:path';

let version: string | undefined;

/**
 * This package's own version, from its `package.json` beside `src/` and
 * `dist/`; `'0.0.0'` when it cannot be read. Not re-exported from the package
 * index.
 */
export function readOwnVersion(): string {
  if (version === undefined) {
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(import.meta.dirname, '../package.json'), 'utf8'),
      ) as { version?: string };
      version = pkg.version ?? '0.0.0';
    } catch {
      version = '0.0.0';
    }
  }
  return version;
}
