import fs from 'node:fs';
import path from 'node:path';

const ownPackageJson = path.resolve(import.meta.dirname, '../package.json');

/** A fresh copy of the module: it reads the file once. */
async function freshReadOwnVersion() {
  vi.resetModules();
  return (await import('./package-json')).readOwnVersion;
}

/** Answers a read of the package's own `package.json` with `answer`, and any other as it is. */
function readingOwnPackageJson(answer: () => string) {
  const read = fs.readFileSync as (...args: unknown[]) => unknown;
  vi.spyOn(fs, 'readFileSync').mockImplementation(((...args: unknown[]) =>
    typeof args[0] === 'string' && path.resolve(args[0]) === ownPackageJson
      ? answer()
      : read(...args)) as typeof fs.readFileSync);
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("is the version in the package's own package.json", async () => {
  const { version } = JSON.parse(fs.readFileSync(ownPackageJson, 'utf8')) as { version: string };
  expect((await freshReadOwnVersion())()).toBe(version);
});

test('is read from that file, once', async () => {
  readingOwnPackageJson(() => JSON.stringify({ version: '1.2.3' }));
  const readOwnVersion = await freshReadOwnVersion();
  expect(readOwnVersion()).toBe('1.2.3');
  expect(readOwnVersion()).toBe('1.2.3');
  expect(
    vi
      .mocked(fs.readFileSync)
      .mock.calls.filter(
        ([file]) => typeof file === 'string' && path.resolve(file) === ownPackageJson,
      ),
  ).toHaveLength(1);
});

test('fails where that file cannot be read, rather than answer a version it is not', async () => {
  readingOwnPackageJson(() => {
    throw Object.assign(new Error(`ENOENT: no such file, open '${ownPackageJson}'`), {
      code: 'ENOENT',
    });
  });
  const readOwnVersion = await freshReadOwnVersion();
  expect(() => readOwnVersion()).toThrow('ENOENT');
});
