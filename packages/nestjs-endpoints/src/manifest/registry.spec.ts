import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createManifest,
  findManifestCovering,
  registerEndpointManifest,
} from './registry.js';

// Lookup only: keeping files in sync is covered by sync.spec.ts.
vi.mock('./sync.js', () => ({
  syncManifest: (_file: string, keys: readonly string[]) => keys,
}));

const loader = () => Promise.resolve({});

describe('createManifest', () => {
  const file = path.join('/app/src', 'endpoints.gen.ts');
  const files = {
    'shop/router.module.ts': loader,
    'shop/b.endpoint.ts': loader,
    'shop/a/x.endpoint.ts': loader,
    'top.endpoint.ts': loader,
  };

  test('builds a sorted directory tree of the loadable keys', () => {
    const manifest = createManifest(file, { files }, Object.keys(files));
    expect(manifest.dir).toBe('/app/src');
    expect(manifest.importExtension).toBe('js');
    expect([...manifest.tree.get('/app/src')!]).toEqual([
      ['shop', true],
      ['top.endpoint.ts', false],
    ]);
    expect([...manifest.tree.get('/app/src/shop')!]).toEqual([
      ['a', true],
      ['b.endpoint.ts', false],
      ['router.module.ts', false],
    ]);
    expect([...manifest.tree.get('/app/src/shop/a')!]).toEqual([
      ['x.endpoint.ts', false],
    ]);
    expect(manifest.loaders.get('/app/src/shop/a/x.endpoint.ts')).toBe(
      loader,
    );
  });

  test('exposes only the loadable keys, but remembers all declared ones', () => {
    const manifest = createManifest(file, { files }, ['top.endpoint.ts']);
    expect([...manifest.tree.keys()]).toEqual(['/app/src']);
    expect([...manifest.loaders.keys()]).toEqual([
      '/app/src/top.endpoint.ts',
    ]);
    expect(manifest.keys).toEqual(Object.keys(files));
  });
});

describe('findManifestCovering', () => {
  const register = (dir: string, keys: string[]) =>
    registerEndpointManifest(
      pathToFileURL(path.join(dir, 'endpoints.gen.ts')).href,
      { files: Object.fromEntries(keys.map((k) => [k, loader])) },
    );

  test('finds the most specific manifest containing a directory', () => {
    register('/mono/app', ['a.endpoint.ts']);
    register('/mono/app/admin', ['b.endpoint.ts']);
    expect(findManifestCovering('/mono/app')?.dir).toBe('/mono/app');
    expect(findManifestCovering('/mono/app/x/y')?.dir).toBe('/mono/app');
    expect(findManifestCovering('/mono/app/admin/z')?.dir).toBe(
      '/mono/app/admin',
    );
    expect(findManifestCovering('/mono/application')).toBeUndefined();
    expect(findManifestCovering('/elsewhere')).toBeUndefined();
  });

  test('registering the same manifest again replaces it', () => {
    register('/again', ['old.endpoint.ts']);
    register('/again', ['new.endpoint.ts']);
    expect(findManifestCovering('/again')?.keys).toEqual([
      'new.endpoint.ts',
    ]);
  });
});
