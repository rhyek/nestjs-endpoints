import fs from 'node:fs/promises';
import path from 'node:path';
import { getCallsiteFile } from './helpers.js';

/**
 * This package's own `package.json`, found by walking up from the caller's
 * file; `null` when none is found. Not re-exported from the package index.
 */
export async function readPkgJson() {
  const start = path.dirname(getCallsiteFile());
  for (
    let dir = start;
    dir !== path.parse(dir).root && dir !== process.cwd();
    dir = path.dirname(dir)
  ) {
    const pkgJson = path.join(dir, 'package.json');
    if (await fs.stat(pkgJson).catch(() => false)) {
      const parsed = JSON.parse(await fs.readFile(pkgJson, 'utf-8'));
      if (parsed.name === 'nestjs-endpoints') {
        return parsed;
      }
    }
  }
  return null;
}
