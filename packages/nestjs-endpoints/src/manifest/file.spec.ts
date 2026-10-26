import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readImportExtension, writeManifest } from './file.js';
import { renderManifest } from './render.js';

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ne-file-'));
  file = path.join(dir, 'endpoints.gen.ts');
});

test('writeManifest replaces the file and leaves no temp file behind', () => {
  fs.writeFileSync(file, 'old');
  writeManifest(file, ['a.endpoint.ts'], 'ts');
  expect(fs.readFileSync(file, 'utf8')).toBe(renderManifest(['a.endpoint.ts'], 'ts'));
  expect(fs.readdirSync(dir)).toEqual(['endpoints.gen.ts']);
});

test('writeManifest leaves a file that already says the same alone', () => {
  expect(writeManifest(file, ['a.endpoint.ts'], 'js')).toBe(true);
  const before = fs.statSync(file).mtimeMs;
  expect(writeManifest(file, ['a.endpoint.ts'], 'js')).toBe(false);
  expect(fs.statSync(file).mtimeMs).toBe(before);
  expect(writeManifest(file, ['a.endpoint.ts'], 'ts')).toBe(true);
});

describe('readImportExtension', () => {
  test('reads what the generator wrote', () => {
    writeManifest(file, [], 'ts');
    expect(readImportExtension(file)).toBe('ts');
  });

  test('survives a formatter switching quotes', () => {
    fs.writeFileSync(
      file,
      "registerEndpointManifest(import.meta.url, { importExtension: 'ts', files: {} });",
    );
    expect(readImportExtension(file)).toBe('ts');
  });

  test('defaults to js for a missing or unrecognized file', () => {
    expect(readImportExtension(file)).toBe('js');
    fs.writeFileSync(file, '// something else');
    expect(readImportExtension(file)).toBe('js');
  });
});
