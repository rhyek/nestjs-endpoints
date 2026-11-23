import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findRouterFiles, scanRoutingFiles, stripExtension } from './routing-files';

function tree(files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ne-scan-'));
  for (const f of files) {
    fs.mkdirSync(path.join(dir, path.dirname(f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), '');
  }
  return dir;
}

describe('scanRoutingFiles', () => {
  test('lists endpoint and router-module files as sorted POSIX paths', () => {
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

  test('lists a router file under either of its names', () => {
    const dir = tree(['a/router.ts', 'b/router.module.ts', 'c/router.mts']);
    expect(scanRoutingFiles(dir)).toEqual(['a/router.ts', 'b/router.module.ts', 'c/router.mts']);
  });

  test('takes no other file with `router` in its name for a router file', () => {
    const dir = tree([
      'user.router.ts',
      'trpc-router.ts',
      'router.spec.ts',
      'router.d.ts',
      'router.service.ts',
      'routers.ts',
    ]);
    expect(scanRoutingFiles(dir)).toEqual([]);
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

describe('findRouterFiles', () => {
  test('names every file that may be a nested router before it asks whether one is', async () => {
    const dir = tree(['a/router.ts', 'b/router.module.ts', 'b/x.endpoint.ts', 'c/y.endpoint.ts']);
    const calls: string[] = [];
    const found = await findRouterFiles(
      [dir],
      path.join(dir, 'app.module.ts'),
      (file) => {
        calls.push(`ask ${path.relative(dir, file)}`);
        return Promise.resolve(file.includes(`${path.sep}a${path.sep}`));
      },
      (file) => calls.push(`may be ${path.relative(dir, file)}`),
    );
    expect(calls).toEqual([
      'may be a/router.ts',
      'may be b/router.module.ts',
      'ask a/router.ts',
      'ask b/router.module.ts',
    ]);
    const relative = (files: Set<string>) => [...files].map((file) => path.relative(dir, file));
    expect(relative(found.nestedRouterModuleFiles)).toEqual(['a/router.ts']);
    // `b` has no router after all: its endpoint file is the router's above.
    expect(relative(found.endpointFiles).sort()).toEqual(['b/x.endpoint.ts', 'c/y.endpoint.ts']);
  });

  describe("of a folder with several files of a router file's name", () => {
    /** What the walk finds and asks about, from `dir`, given which files are routers. */
    async function walked(files: string[], routers: string[], own = 'app.module.ts') {
      const dir = tree(files);
      const asked: string[] = [];
      const found = await findRouterFiles([dir], path.join(dir, own), (file) => {
        const name = path.relative(dir, file);
        asked.push(name);
        return Promise.resolve(routers.includes(name));
      });
      const relative = (all: Iterable<string>) => [...all].map((f) => path.relative(dir, f)).sort();
      return {
        asked,
        nested: relative(found.nestedRouterModuleFiles),
        endpoints: relative(found.endpointFiles),
        passedOver: relative(found.passedOver),
      };
    }

    test('takes router.ts, and asks about router.module.ts only when router.ts is no router', async () => {
      const files = ['p/router.ts', 'p/router.module.ts', 'p/a.endpoint.ts'];
      await expect(walked(files, ['p/router.ts', 'p/router.module.ts'])).resolves.toEqual({
        asked: ['p/router.ts'],
        nested: ['p/router.ts'],
        endpoints: [],
        passedOver: ['p/router.module.ts'],
      });
      await expect(walked(files, ['p/router.module.ts'])).resolves.toMatchObject({
        asked: ['p/router.ts', 'p/router.module.ts'],
        nested: ['p/router.module.ts'],
        passedOver: ['p/router.ts'],
      });
      await expect(walked(files, [])).resolves.toMatchObject({
        asked: ['p/router.ts', 'p/router.module.ts'],
        nested: [],
        endpoints: ['p/a.endpoint.ts'],
      });
    });

    test('takes a compiled router.js over a router.module.js a build left beside it', async () => {
      const files = ['p/router.js', 'p/router.module.js'];
      await expect(walked(files, ['p/router.js', 'p/router.module.js'])).resolves.toMatchObject({
        asked: ['p/router.js'],
        nested: ['p/router.js'],
      });
    });

    test('takes router.module.ts before a file named as one, as `shop.router.module.ts`', async () => {
      const files = ['p/router.module.ts', 'p/shop.router.module.ts'];
      await expect(walked(files, files)).resolves.toMatchObject({
        asked: ['p/router.module.ts'],
        nested: ['p/router.module.ts'],
      });
    });

    test('takes the TypeScript file of a router and its compiled twin, before any other name', async () => {
      const files = ['p/router.ts', 'p/router.js', 'p/router.module.ts', 'p/router.module.js'];
      await expect(walked(files, ['p/router.ts', 'p/router.module.ts'])).resolves.toMatchObject({
        asked: ['p/router.ts'],
        nested: ['p/router.ts'],
        passedOver: ['p/router.module.ts'],
      });
    });

    test.each(['mts', 'mjs'])('reads a router.%s as it does a router.ts', async (extension) => {
      const files = [`p/router.${extension}`, `p/router.module.${extension}`];
      await expect(walked(files, files)).resolves.toMatchObject({
        asked: [files[0]],
        nested: [files[0]],
      });
    });

    test('asks about every folder that has such files, each on its own', async () => {
      const files = [
        'p/router.ts',
        'q/router.module.ts',
        'q/shop.router.module.ts',
        'q/deep/router.ts',
      ];
      await expect(
        walked(files, ['p/router.ts', 'q/shop.router.module.ts']),
      ).resolves.toMatchObject({
        asked: ['p/router.ts', 'q/router.module.ts', 'q/shop.router.module.ts'],
        // `q` is a nested router: nothing under it is the walking router's to ask about.
        nested: ['p/router.ts', 'q/shop.router.module.ts'],
      });
    });

    test('fails when two files of one name are both routers', async () => {
      const files = ['p/a.router.module.ts', 'p/b.router.module.ts'];
      await expect(walked(files, files)).rejects.toThrow(
        /p has both a\.router\.module\.ts and b\.router\.module\.ts\. A folder has one router file/,
      );
      // One of the two that is a router is the folder's.
      await expect(walked(files, ['p/b.router.module.ts'])).resolves.toMatchObject({
        nested: ['p/b.router.module.ts'],
      });
    });

    test('of the router walking, is its own: no other file there is asked about', async () => {
      const files = ['router.module.ts', 'router.ts', 'a.endpoint.ts'];
      await expect(walked(files, ['router.ts'], 'router.module.ts')).resolves.toMatchObject({
        asked: [],
        nested: [],
        endpoints: ['a.endpoint.ts'],
        passedOver: ['router.ts'],
      });
    });
  });
});
