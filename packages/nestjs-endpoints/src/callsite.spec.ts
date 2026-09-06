import { pathToFileURL } from 'node:url';
import { callsiteFileToPath } from './callsite.js';

describe('callsiteFileToPath', () => {
  test('decodes a file:// URL', () => {
    expect(callsiteFileToPath('file:///a/b/c.js')).toBe('/a/b/c.js');
  });

  test('decodes percent-escapes, so a path with a space survives', () => {
    // Regression: a textual `file://` strip left this as `/a%20b/c.js`,
    // which no longer exists on disk.
    expect(callsiteFileToPath('file:///a%20b/c.js')).toBe('/a b/c.js');
  });

  test('round-trips a real path containing a space', () => {
    const original = '/tmp/some dir/endpoint.js';
    expect(callsiteFileToPath(pathToFileURL(original).href)).toBe(
      original,
    );
  });

  test('passes a bare path through unchanged', () => {
    expect(callsiteFileToPath('/a/b/c.js')).toBe('/a/b/c.js');
  });
});
