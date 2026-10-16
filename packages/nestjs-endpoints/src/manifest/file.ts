import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_IMPORT_EXTENSION,
  ImportExtension,
  renderManifest,
} from './render.js';

/**
 * Writes the manifest atomically (temp file, then rename), so a process
 * importing it — or another process writing it at the same moment, like
 * parallel test workers — never sees half a file.
 */
export function writeManifest(
  file: string,
  keys: readonly string[],
  importExtension: ImportExtension,
): void {
  const temp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${crypto.randomUUID()}.tmp`,
  );
  fs.writeFileSync(temp, renderManifest(keys, importExtension));
  try {
    fs.renameSync(temp, file);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw error;
  }
}

/**
 * The `importExtension` an existing manifest file declares, so regenerating it
 * keeps the setting. Read from the text — the file is TypeScript and may have
 * been reformatted, so this tolerates either quote style.
 */
export function readImportExtension(file: string): ImportExtension {
  try {
    const match = /importExtension:\s*["'](js|ts)["']/.exec(
      fs.readFileSync(file, 'utf8'),
    );
    return (
      (match?.[1] as ImportExtension | undefined) ??
      DEFAULT_IMPORT_EXTENSION
    );
  } catch {
    return DEFAULT_IMPORT_EXTENSION;
  }
}
