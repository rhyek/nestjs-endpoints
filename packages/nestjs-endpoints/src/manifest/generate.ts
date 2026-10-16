import fs from 'node:fs';
import path from 'node:path';
import { readImportExtension, writeManifest } from './file.js';
import { ImportExtension, MANIFEST_FILE_NAME } from './render.js';
import { scanRoutingFiles } from './scan.js';

export const DEFAULT_SOURCE_DIR = 'src';

/**
 * Writes `<dir>/endpoints.gen.ts` from the files under `dir`. Without an
 * explicit `importExtension`, an existing manifest's setting is kept.
 */
export function generateManifest(opts: {
  dir: string;
  importExtension?: ImportExtension;
}): { file: string; keys: string[] } {
  if (!fs.statSync(opts.dir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Source directory not found: ${opts.dir}`);
  }
  const file = path.join(opts.dir, MANIFEST_FILE_NAME);
  const keys = scanRoutingFiles(opts.dir);
  writeManifest(
    file,
    keys,
    opts.importExtension ?? readImportExtension(file),
  );
  return { file, keys };
}

/**
 * Flags the manifest as generated where the project already says so for
 * other files: `.gitattributes` (collapses it in GitHub diffs) always, and
 * `.prettierignore` when the project has one. Idempotent. Returns the files
 * it changed.
 */
export function markGenerated(
  cwd: string,
  manifestFile: string,
): string[] {
  const entry = path.relative(cwd, manifestFile).split(path.sep).join('/');
  const changed: string[] = [];
  const append = (name: string, line: string, create: boolean) => {
    const file = path.join(cwd, name);
    const existing = fs.existsSync(file)
      ? fs.readFileSync(file, 'utf8')
      : undefined;
    if (existing === undefined && !create) return;
    if (existing?.split(/\r?\n/).some((l) => l.trim() === line)) return;
    const separator = existing && !existing.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(file, `${existing ?? ''}${separator}${line}\n`);
    changed.push(file);
  };
  append('.gitattributes', `${entry} linguist-generated`, true);
  append('.prettierignore', entry, false);
  return changed;
}
