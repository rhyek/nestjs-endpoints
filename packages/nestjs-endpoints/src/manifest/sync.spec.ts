import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Logger } from '@nestjs/common';
import { readImportExtension, writeManifest } from './file.js';
import {
  findManifestCovering,
  registerEndpointManifest,
} from './registry.js';
import { closeManifestWatchers, syncManifest, syncMode } from './sync.js';

const DEV = {};
const TEST = { NODE_ENV: 'test' };

let root: string;
let src: string;
let manifest: string;
let log: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;

function touch(rel: string, base = src) {
  const file = path.join(base, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
}

/** The keys the manifest file on disk declares. */
function keysOnDisk(): string[] {
  return [
    ...fs.readFileSync(manifest, 'utf8').matchAll(/^ {4}"(.+?)":/gm),
  ].map((m) => m[1]);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ne-sync-'));
  src = path.join(root, 'src');
  manifest = path.join(src, 'endpoints.gen.ts');
  fs.mkdirSync(src);
  log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  closeManifestWatchers();
  vi.restoreAllMocks();
  fs.chmodSync(src, 0o755);
});

test('syncMode', () => {
  expect(syncMode({ NODE_ENV: 'production' })).toBe('off');
  expect(syncMode({ NODE_ENV: 'production', CI: 'true' })).toBe('off');
  expect(syncMode({ CI: 'true' })).toBe('check');
  expect(syncMode({ CI: '1', NODE_ENV: 'test' })).toBe('check');
  for (const CI of [undefined, '', 'false', '0']) {
    expect(syncMode({ CI })).toBe('write');
  }
  expect(syncMode(TEST)).toBe('write');
});

describe('at startup', () => {
  test('an up-to-date manifest is left alone', () => {
    touch('a.endpoint.ts');
    writeManifest(manifest, ['a.endpoint.ts'], 'js');
    const before = fs.statSync(manifest).mtimeMs;
    expect(syncManifest(manifest, ['a.endpoint.ts'], 'js', TEST)).toEqual([
      'a.endpoint.ts',
    ]);
    expect(fs.statSync(manifest).mtimeMs).toBe(before);
  });

  test('an empty manifest is filled in', () => {
    touch('a.endpoint.ts');
    touch('shop/router.module.ts');
    writeManifest(manifest, [], 'js');
    expect(syncManifest(manifest, [], 'js', DEV)).toEqual([]);
    expect(keysOnDisk()).toEqual([
      'a.endpoint.ts',
      'shop/router.module.ts',
    ]);
  });

  test('a deleted endpoint is dropped from the file and is not loaded', () => {
    touch('a.endpoint.ts');
    writeManifest(manifest, ['a.endpoint.ts', 'gone.endpoint.ts'], 'js');
    expect(
      syncManifest(
        manifest,
        ['a.endpoint.ts', 'gone.endpoint.ts'],
        'js',
        TEST,
      ),
    ).toEqual(['a.endpoint.ts']);
    expect(keysOnDisk()).toEqual(['a.endpoint.ts']);
  });

  test('routers never see a deleted file, so it cannot fail the boot', () => {
    touch('a.endpoint.ts');
    const load = () => Promise.resolve({});
    registerEndpointManifest(pathToFileURL(manifest).href, {
      files: { 'a.endpoint.ts': load, 'gone.endpoint.ts': load },
    });
    expect([...findManifestCovering(src)!.loaders.keys()]).toEqual([
      path.join(src, 'a.endpoint.ts'),
    ]);
  });

  test('a renamed endpoint is swapped, and the old name is not loaded', () => {
    touch('new-name.endpoint.ts');
    expect(
      syncManifest(manifest, ['old-name.endpoint.ts'], 'js', DEV),
    ).toEqual([]);
    expect(keysOnDisk()).toEqual(['new-name.endpoint.ts']);
  });

  test('a test run that finds added endpoints regenerates, then fails clearly', () => {
    touch('a.endpoint.ts');
    touch('new.endpoint.ts');
    writeManifest(manifest, ['a.endpoint.ts'], 'js');
    expect(() =>
      syncManifest(manifest, ['a.endpoint.ts'], 'js', TEST),
    ).toThrow(
      /regenerated:\n {2}\+ new\.endpoint\.ts\n.*Run the tests again\.\n.*`npx nestjs-endpoints generate` before the tests/,
    );
    expect(keysOnDisk()).toEqual(['a.endpoint.ts', 'new.endpoint.ts']);
    // The next run loads the regenerated manifest.
    expect(
      syncManifest(
        manifest,
        ['a.endpoint.ts', 'new.endpoint.ts'],
        'js',
        TEST,
      ),
    ).toEqual(['a.endpoint.ts', 'new.endpoint.ts']);
  });

  test('an added endpoint is reported as not served by this process', () => {
    touch('a.endpoint.ts');
    writeManifest(manifest, [], 'js');
    syncManifest(manifest, [], 'js', DEV);
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(
        /\+ a\.endpoint\.ts\nThis process loaded the previous version.*`npx nestjs-endpoints generate` before starting it/,
      ),
    );
  });

  test('the import extension is kept', () => {
    touch('a.endpoint.ts');
    syncManifest(manifest, [], 'ts', DEV);
    expect(readImportExtension(manifest)).toBe('ts');
    expect(fs.readFileSync(manifest, 'utf8')).toContain(
      'import("./a.endpoint.ts")',
    );
  });

  test('in CI a stale manifest is an error, and nothing is written', () => {
    touch('a.endpoint.ts');
    writeManifest(manifest, ['gone.endpoint.ts'], 'js');
    expect(() =>
      syncManifest(manifest, ['gone.endpoint.ts'], 'js', { CI: 'true' }),
    ).toThrow(
      /out of date[\s\S]*\+ a\.endpoint\.ts[\s\S]*- gone\.endpoint\.ts/,
    );
    expect(keysOnDisk()).toEqual(['gone.endpoint.ts']);
  });

  test('in production the manifest is trusted as is', () => {
    touch('a.endpoint.ts');
    writeManifest(manifest, ['gone.endpoint.ts'], 'js');
    expect(
      syncManifest(manifest, ['gone.endpoint.ts'], 'js', {
        NODE_ENV: 'production',
      }),
    ).toEqual(['gone.endpoint.ts']);
    expect(keysOnDisk()).toEqual(['gone.endpoint.ts']);
  });

  test('a read-only source tree warns instead of failing', () => {
    touch('a.endpoint.ts');
    writeManifest(manifest, [], 'js');
    fs.chmodSync(src, 0o555);
    expect(syncManifest(manifest, [], 'js', TEST)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('could not be rewritten'),
    );
    expect(keysOnDisk()).toEqual([]);
  });
});

describe('compiled apps', () => {
  let dist: string;
  let compiled: string;

  beforeEach(() => {
    dist = path.join(root, 'dist');
    compiled = path.join(dist, 'endpoints.gen.js');
    touch('a.endpoint.ts');
    writeManifest(manifest, ['a.endpoint.ts', 'gone.endpoint.ts'], 'js');
    // tsc leaves the deleted endpoint's output behind.
    touch('a.endpoint.js', dist);
    touch('gone.endpoint.js', dist);
  });

  const map = JSON.stringify({
    version: 3,
    file: 'endpoints.gen.js',
    sourceRoot: '',
    sources: ['../src/endpoints.gen.ts'],
    mappings: '',
  });

  test.each([
    [
      'an external source map',
      '//# sourceMappingURL=endpoints.gen.js.map',
    ],
    [
      'an inline source map',
      `//# sourceMappingURL=data:application/json;base64,${Buffer.from(map).toString('base64')}`,
    ],
  ])('find the source manifest through %s', (_, comment) => {
    fs.writeFileSync(compiled, `export {};\n${comment}\n`);
    fs.writeFileSync(`${compiled}.map`, map);
    expect(
      syncManifest(
        compiled,
        ['a.endpoint.ts', 'gone.endpoint.ts'],
        'js',
        TEST,
      ),
    ).toEqual(['a.endpoint.ts']);
    expect(keysOnDisk()).toEqual(['a.endpoint.ts']);
  });

  test('a current source manifest is not rewritten while dist/ lags behind', () => {
    fs.writeFileSync(
      compiled,
      'export {};\n//# sourceMappingURL=endpoints.gen.js.map\n',
    );
    fs.writeFileSync(`${compiled}.map`, map);
    writeManifest(manifest, ['a.endpoint.ts'], 'js');
    const before = fs.statSync(manifest).mtimeMs;
    expect(
      syncManifest(
        compiled,
        ['a.endpoint.ts', 'gone.endpoint.ts'],
        'js',
        TEST,
      ),
    ).toEqual(['a.endpoint.ts']);
    expect(fs.statSync(manifest).mtimeMs).toBe(before);
  });

  test('without a source map nothing is synced, with a warning', () => {
    fs.writeFileSync(compiled, 'export {};\n');
    expect(
      syncManifest(
        compiled,
        ['a.endpoint.ts', 'gone.endpoint.ts'],
        'js',
        TEST,
      ),
    ).toEqual(['a.endpoint.ts', 'gone.endpoint.ts']);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Cannot find the source'),
    );
  });
});

describe('while running in development', () => {
  beforeEach(async () => {
    touch('a.endpoint.ts');
    touch('shop/b.endpoint.ts');
    writeManifest(manifest, ['a.endpoint.ts', 'shop/b.endpoint.ts'], 'js');
    syncManifest(
      manifest,
      ['a.endpoint.ts', 'shop/b.endpoint.ts'],
      'js',
      DEV,
    );
    // A watcher can miss events in its first moments (macOS FSEvents does),
    // so wait until it demonstrably reports changes before testing them.
    const probe = path.join(src, 'probe.endpoint.ts');
    await vi.waitFor(
      () => {
        fs.writeFileSync(probe, '');
        expect(keysOnDisk()).toContain('probe.endpoint.ts');
      },
      { timeout: 5000, interval: 200 },
    );
    fs.rmSync(probe);
    await expectKeys(['a.endpoint.ts', 'shop/b.endpoint.ts']);
  });

  const expectKeys = (keys: string[]) =>
    vi.waitFor(() => expect(keysOnDisk()).toEqual(keys), {
      timeout: 3000,
    });

  test('an added endpoint is written in', async () => {
    touch('c.endpoint.ts');
    await expectKeys([
      'a.endpoint.ts',
      'c.endpoint.ts',
      'shop/b.endpoint.ts',
    ]);
  });

  test('an added endpoint is reported as served after the restart', async () => {
    log.mockClear();
    touch('c.endpoint.ts');
    await vi.waitFor(
      () =>
        expect(log).toHaveBeenCalledWith(
          expect.stringMatching(
            /\+ c\.endpoint\.ts\nAdded endpoints are served after a restart/,
          ),
        ),
      { timeout: 3000 },
    );
  });

  test('a deleted endpoint is written out', async () => {
    fs.rmSync(path.join(src, 'a.endpoint.ts'));
    await expectKeys(['shop/b.endpoint.ts']);
  });

  test('a renamed directory is picked up', async () => {
    fs.renameSync(path.join(src, 'shop'), path.join(src, 'store'));
    await expectKeys(['a.endpoint.ts', 'store/b.endpoint.ts']);
  });

  test('an added router module is written in', async () => {
    touch('shop/router.module.ts');
    await expectKeys([
      'a.endpoint.ts',
      'shop/b.endpoint.ts',
      'shop/router.module.ts',
    ]);
  });

  test('other files do not rewrite the manifest', async () => {
    const before = fs.statSync(manifest).mtimeMs;
    touch('shop/shop.service.ts');
    // Let the debounced rescan run, then check nothing was written.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fs.statSync(manifest).mtimeMs).toBe(before);
  });

  test('tests do not start a watcher', async () => {
    closeManifestWatchers();
    syncManifest(
      manifest,
      ['a.endpoint.ts', 'shop/b.endpoint.ts'],
      'js',
      TEST,
    );
    touch('c.endpoint.ts');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(keysOnDisk()).toEqual(['a.endpoint.ts', 'shop/b.endpoint.ts']);
  });
});
