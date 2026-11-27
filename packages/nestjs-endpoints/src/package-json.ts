import fs from 'node:fs';
import { findPackageJSON } from 'node:module';

let version: string | undefined;

/**
 * This package's own version, from the `package.json` nearest this module, which is the
 * package's from `src/` and `dist/` alike. A file that cannot be read fails: the version is
 * in every client's hash. Not re-exported from the package index.
 */
export function readOwnVersion(): string {
  if (version === undefined) {
    const file = findPackageJSON(import.meta.url);
    if (!file) {
      throw new Error(`nestjs-endpoints: no package.json above ${import.meta.filename}.`);
    }
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as { version?: string };
    version = pkg.version ?? '0.0.0';
  }
  return version;
}
