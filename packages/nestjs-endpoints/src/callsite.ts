/**
 * Normalize a callsite's reported file name to an absolute filesystem path.
 *
 * Under ESM, V8 reports callsites as `file://` URLs. Stripping the prefix
 * textually is wrong twice: percent-escapes survive, so a project directory
 * containing a space arrives as `/a%20b/c.js`, and a Windows URL decodes to
 * `/C:/x` with a leading slash. `fileURLToPath` handles both.
 *
 * Not re-exported from the package index — this is internal.
 */
import { fileURLToPath } from 'node:url';

export function callsiteFileToPath(fileName: string): string {
  return fileName.startsWith('file:') ? fileURLToPath(fileName) : fileName;
}
