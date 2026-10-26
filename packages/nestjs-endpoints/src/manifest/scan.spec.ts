import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanRoutingFiles, stripExtension } from './scan.js';

function tree(files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ne-scan-'));
  for (const f of files) {
    fs.mkdirSync(path.join(dir, path.dirname(f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), '');
  }
  return dir;
}

describe('scanRoutingFiles', () => {
  test('lists endpoint and router-module files as sorted POSIX keys', () => {
    const dir = tree([
      'shop/router.module.ts',
      'shop/endpoints/stats.endpoint.ts',
      'endpoint.ts',
      'recipes/$id.view/endpoint.ts',
      'a/b/c/deep.endpoint.mts',
    ]);
    expect(scanRoutingFiles(dir)).toEqual([
      'a/b/c/deep.endpoint.mts',
      'endpoint.ts',
      'recipes/$id.view/endpoint.ts',
      'shop/endpoints/stats.endpoint.ts',
      'shop/router.module.ts',
    ]);
  });

  test('ignores everything that is not routing source', () => {
    const dir = tree([
      'ok.endpoint.ts',
      'hello.service.ts',
      'list.endpoint.spec.ts',
      'list.endpoint.d.ts',
      'myendpoint.ts',
      'app.module.ts',
      'node_modules/pkg/x.endpoint.js',
      '.cache/y.endpoint.ts',
    ]);
    expect(scanRoutingFiles(dir)).toEqual(['ok.endpoint.ts']);
  });

  test('a TypeScript source wins over a same-stem JavaScript file', () => {
    const dir = tree([
      'a.endpoint.js',
      'a.endpoint.ts',
      'b.endpoint.mjs',
      'b.endpoint.mts',
      'c.endpoint.js',
    ]);
    expect(scanRoutingFiles(dir)).toEqual(['a.endpoint.ts', 'b.endpoint.mts', 'c.endpoint.js']);
  });

  test('follows symlinked directories', () => {
    const dir = tree(['real/x.endpoint.ts']);
    fs.symlinkSync(path.join(dir, 'real'), path.join(dir, 'linked'));
    expect(scanRoutingFiles(dir)).toEqual(['linked/x.endpoint.ts', 'real/x.endpoint.ts']);
  });

  test('a missing directory has no files', () => {
    expect(scanRoutingFiles('/does/not/exist')).toEqual([]);
  });
});

test('stripExtension', () => {
  expect(stripExtension('/a/b.endpoint.ts')).toBe('/a/b.endpoint');
  expect(stripExtension('/a/b.endpoint.js')).toBe('/a/b.endpoint');
  expect(stripExtension('/a/b')).toBe('/a/b');
});
