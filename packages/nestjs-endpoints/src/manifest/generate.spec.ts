import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readImportExtension } from './file.js';
import { generateManifest, markGenerated } from './generate.js';

let cwd: string;
let src: string;

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ne-gen-'));
  src = path.join(cwd, 'src');
  fs.mkdirSync(path.join(src, 'shop'), { recursive: true });
  fs.writeFileSync(path.join(src, 'shop/stats.endpoint.ts'), '');
});

describe('generateManifest', () => {
  test('writes the manifest for the directory', () => {
    const { file, keys, written } = generateManifest({ dir: src });
    expect(file).toBe(path.join(src, 'endpoints.gen.ts'));
    expect(keys).toEqual(['shop/stats.endpoint.ts']);
    expect(written).toBe(true);
    expect(generateManifest({ dir: src }).written).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toContain(
      'import("./shop/stats.endpoint.js")',
    );
  });

  test('leaves an unchanged manifest untouched, so watchers do not react', () => {
    const { file } = generateManifest({ dir: src });
    const before = fs.statSync(file).mtimeMs;
    expect(generateManifest({ dir: src }).written).toBe(false);
    expect(fs.statSync(file).mtimeMs).toBe(before);
  });

  test('keeps the import extension unless told otherwise', () => {
    generateManifest({ dir: src, importExtension: 'ts' });
    generateManifest({ dir: src });
    expect(readImportExtension(path.join(src, 'endpoints.gen.ts'))).toBe(
      'ts',
    );
    generateManifest({ dir: src, importExtension: 'js' });
    expect(readImportExtension(path.join(src, 'endpoints.gen.ts'))).toBe(
      'js',
    );
  });

  test('a missing directory is an error', () => {
    expect(() =>
      generateManifest({ dir: path.join(cwd, 'nope') }),
    ).toThrow(/Source directory not found/);
  });
});

describe('markGenerated', () => {
  const read = (name: string) =>
    fs.readFileSync(path.join(cwd, name), 'utf8');

  test('creates .gitattributes, and leaves prettier alone when unused', () => {
    expect(markGenerated(cwd)).toEqual([path.join(cwd, '.gitattributes')]);
    expect(read('.gitattributes')).toBe(
      '**/endpoints.gen.ts linguist-generated\n',
    );
    expect(fs.existsSync(path.join(cwd, '.prettierignore'))).toBe(false);
  });

  test('appends to existing files once', () => {
    fs.writeFileSync(path.join(cwd, '.gitattributes'), '* text=auto');
    fs.writeFileSync(path.join(cwd, '.prettierignore'), 'dist\n');
    markGenerated(cwd);
    expect(markGenerated(cwd)).toEqual([]);
    expect(read('.gitattributes')).toBe(
      '* text=auto\n**/endpoints.gen.ts linguist-generated\n',
    );
    expect(read('.prettierignore')).toBe('dist\n**/endpoints.gen.ts\n');
  });
});
