import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { closeRoutingFileWatchers, watchRoutingFiles } from './watch';

let project: string;
let src: string;
let near: string;
let warn: ReturnType<typeof vi.spyOn>;

function touch(rel: string) {
  const file = path.join(src, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
}

const cacheDir = () => path.join(project, 'node_modules/.cache/nestjs-endpoints');
const cacheFiles = () => (fs.existsSync(cacheDir()) ? fs.readdirSync(cacheDir()) : []);
const cacheFile = () => path.join(cacheDir(), cacheFiles()[0]);
/** The routing files the cache file lists, relative to `src`. */
const listed = async (): Promise<string[]> => {
  const source = fs.readFileSync(cacheFile(), 'utf8');
  const files = JSON.parse(source.slice(source.indexOf('['), source.lastIndexOf(']') + 1));
  return files.map((file: string) => path.relative(src, file));
};

// The interval is longer than the watcher's debounce: a probe written more often than that
// would keep postponing the rescan it waits for.
const WAIT = { timeout: 8000, interval: 300 };
const quiet = () => new Promise((resolve) => setTimeout(resolve, 400));

beforeEach(() => {
  project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ne-watch-')));
  src = path.join(project, 'src');
  near = path.join(src, 'app.module.ts');
  fs.mkdirSync(path.join(project, 'node_modules'));
  touch('endpoints/a.endpoint.ts');
  touch('endpoints/shop/router.module.ts');
  warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  closeRoutingFileWatchers();
  vi.restoreAllMocks();
  fs.chmodSync(path.join(project, 'node_modules'), 0o755);
});

const watch = () => watchRoutingFiles({ directories: [path.join(src, 'endpoints')], near });

test('writes a file under node_modules/.cache that lists the routing files', async () => {
  await watch();
  expect(cacheFiles()).toHaveLength(1);
  expect(cacheFile()).toMatch(/\.mjs$/);
  expect(await listed()).toEqual(['endpoints/a.endpoint.ts', 'endpoints/shop/router.module.ts']);
  expect(warn).not.toHaveBeenCalled();
});

test('leaves the file an earlier run wrote alone, even when endpoint files changed since', async () => {
  await watch();
  const before = fs.statSync(cacheFile()).mtimeMs;
  closeRoutingFileWatchers();
  // While the app was not running.
  touch('endpoints/added-while-stopped.endpoint.ts');

  await watch();
  await quiet();

  // Writing it at startup could restart the app that has just started.
  expect(fs.statSync(cacheFile()).mtimeMs).toBe(before);
});

describe('while the app runs', () => {
  beforeEach(async () => {
    await watch();
    // A watcher can miss events in its first moments (macOS FSEvents does), so wait until it
    // demonstrably reports changes.
    const probe = 'endpoints/probe.endpoint.ts';
    /** Waits until the cache file lists the probe, or no longer does. */
    const probeListed = (wanted: boolean) =>
      vi.waitFor(async () => {
        if (wanted) {
          touch(probe);
        }
        if ((await listed()).includes(probe) !== wanted) {
          throw new Error('The watcher has not reported the change');
        }
      }, WAIT);
    await probeListed(true);
    fs.rmSync(path.join(src, probe));
    await probeListed(false);
  });

  test('rewrites it when an endpoint file is added, in a new folder too', async () => {
    touch('endpoints/b.endpoint.ts');
    touch('endpoints/blog/c.endpoint.ts');
    await vi.waitFor(
      async () =>
        expect(await listed()).toEqual([
          'endpoints/a.endpoint.ts',
          'endpoints/b.endpoint.ts',
          'endpoints/blog/c.endpoint.ts',
          'endpoints/shop/router.module.ts',
        ]),
      WAIT,
    );
  });

  test('rewrites it when an endpoint file is renamed or deleted', async () => {
    fs.renameSync(
      path.join(src, 'endpoints/a.endpoint.ts'),
      path.join(src, 'endpoints/z.endpoint.ts'),
    );
    await vi.waitFor(
      async () =>
        expect(await listed()).toEqual([
          'endpoints/shop/router.module.ts',
          'endpoints/z.endpoint.ts',
        ]),
      WAIT,
    );
    fs.rmSync(path.join(src, 'endpoints/shop'), { recursive: true });
    await vi.waitFor(async () => expect(await listed()).toEqual(['endpoints/z.endpoint.ts']), WAIT);
  });

  test('rewrites it when a folder with a dot in its name is renamed', async () => {
    touch('endpoints/recipes/$id.view/endpoint.ts');
    await vi.waitFor(
      async () => expect(await listed()).toContain('endpoints/recipes/$id.view/endpoint.ts'),
      WAIT,
    );
    fs.renameSync(
      path.join(src, 'endpoints/recipes/$id.view'),
      path.join(src, 'endpoints/recipes/$id.show'),
    );
    await vi.waitFor(async () => {
      expect(await listed()).toContain('endpoints/recipes/$id.show/endpoint.ts');
      expect(await listed()).not.toContain('endpoints/recipes/$id.view/endpoint.ts');
    }, WAIT);
  });

  test('leaves it alone when another file changes', async () => {
    const before = fs.statSync(cacheFile()).mtimeMs;
    touch('endpoints/shop/shop.service.ts');
    await quiet();
    expect(fs.statSync(cacheFile()).mtimeMs).toBe(before);
  });

  test('starts no second watcher for the same app', async () => {
    const watchSpy = vi.spyOn(fs, 'watch');
    await watch();
    expect(watchSpy).not.toHaveBeenCalled();
  });
});

test('learns of an endpoint file in a folder that was not there when the app started', async () => {
  const later = path.join(src, 'later/on');
  await watchRoutingFiles({ directories: [later], near });
  expect(await listed()).toEqual([]);

  await vi.waitFor(async () => {
    touch('later/on/first.endpoint.ts');
    expect(await listed()).toEqual(['later/on/first.endpoint.ts']);
  }, WAIT);

  // Watched from `src`, which is above it: what its packages do is none of its business.
  const before = fs.statSync(cacheFile()).mtimeMs;
  fs.mkdirSync(path.join(src, 'node_modules/pkg'), { recursive: true });
  fs.writeFileSync(path.join(src, 'node_modules/pkg/x.endpoint.ts'), '');
  await quiet();
  expect(fs.statSync(cacheFile()).mtimeMs).toBe(before);
});

test('two routers created in one file each have a file of their own, written once', async () => {
  touch('admin/b.endpoint.ts');
  const admin = () => watchRoutingFiles({ directories: [path.join(src, 'admin')], near });
  // As an app starts them: at once.
  await Promise.all([watch(), admin()]);
  expect(cacheFiles()).toHaveLength(2);
  const contents = () =>
    cacheFiles()
      .map((name) => fs.readFileSync(path.join(cacheDir(), name), 'utf8'))
      .join('\n');
  expect(contents()).toContain(path.join(src, 'endpoints/a.endpoint.ts'));
  expect(contents()).toContain(path.join(src, 'admin/b.endpoint.ts'));

  // A second start finds both as it left them: nothing to make `node --watch` restart again.
  const mtimes = () => cacheFiles().map((name) => fs.statSync(path.join(cacheDir(), name)).mtimeMs);
  const before = mtimes();
  closeRoutingFileWatchers();
  await Promise.all([watch(), admin()]);
  await quiet();
  expect(mtimes()).toEqual(before);
});

test('warns once and carries on where node_modules cannot be written', async () => {
  fs.chmodSync(path.join(project, 'node_modules'), 0o555);
  await expect(watch()).resolves.toBeUndefined();
  await expect(watch()).resolves.toBeUndefined();
  // Another router of the same app: still one warning.
  await expect(
    watchRoutingFiles({ directories: [path.join(src, 'admin')], near }),
  ).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith(
    expect.stringMatching(
      /^nestjs-endpoints: watch is on, but .*node_modules\/\.cache\/nestjs-endpoints.* cannot be written, so a new endpoint file needs a manual restart\.$/,
    ),
  );
});

test('warns and carries on where there is no node_modules above the app', async () => {
  fs.rmSync(path.join(project, 'node_modules'), { recursive: true });
  await expect(watch()).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledTimes(1);
  fs.mkdirSync(path.join(project, 'node_modules'));
});
