import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sourceDirectoryOf, sourceFileOf, sourceGoneFilter } from './compiled-source';

let root: string;
let src: string;
let dist: string;

function write(file: string, content = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const map = (source: string) =>
  JSON.stringify({ version: 3, sourceRoot: '', sources: [source], mappings: '' });

/** A compiled file in `dist/` with an external source map naming its file in `src/`. */
function compile(rel: string, opts: { source?: boolean } = {}) {
  const js = path.join(dist, rel.replace(/\.ts$/, '.js'));
  const source = path.join(src, rel);
  write(js, `export {};\n//# sourceMappingURL=${path.basename(js)}.map\n`);
  write(`${js}.map`, map(path.relative(path.dirname(js), source)));
  if (opts.source !== false) {
    write(source);
  }
  return js;
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ne-source-')));
  src = path.join(root, 'src');
  dist = path.join(root, 'dist');
});

describe('sourceFileOf', () => {
  test.each(['a.endpoint.ts', 'a.endpoint.mts', 'a.endpoint.cts'])(
    'a source file is its own source (%s)',
    (name) => {
      expect(sourceFileOf(path.join(src, name))).toBe(path.join(src, name));
    },
  );

  test('a compiled file is the source its external source map names', () => {
    const js = compile('shop/a.endpoint.ts');
    expect(sourceFileOf(js)).toBe(path.join(src, 'shop/a.endpoint.ts'));
  });

  test('a compiled file is the source its inline source map names', () => {
    const js = path.join(dist, 'a.endpoint.js');
    const inline = Buffer.from(map('../src/a.endpoint.ts')).toString('base64');
    write(js, `export {};\n//# sourceMappingURL=data:application/json;base64,${inline}\n`);
    expect(sourceFileOf(js)).toBe(path.join(src, 'a.endpoint.ts'));
  });

  test('names the source whether or not it still exists', () => {
    const js = compile('a.endpoint.ts', { source: false });
    expect(sourceFileOf(js)).toBe(path.join(src, 'a.endpoint.ts'));
  });

  test.each([
    ['has no source map comment', 'export {};\n', undefined],
    ['names a map that is not there', 'export {};\n//# sourceMappingURL=gone.js.map\n', undefined],
    ['has a map that is not JSON', 'export {};\n//# sourceMappingURL=a.endpoint.js.map\n', '{'],
    ['has a map with no sources', 'export {};\n//# sourceMappingURL=a.endpoint.js.map\n', '{}'],
  ])('is undefined for a compiled file that %s', (_, code, mapContent) => {
    const js = path.join(dist, 'a.endpoint.js');
    write(js, code);
    if (mapContent !== undefined) {
      write(`${js}.map`, mapContent);
    }
    expect(sourceFileOf(js)).toBeUndefined();
  });

  test('is undefined for a file that is not there', () => {
    expect(sourceFileOf(path.join(dist, 'nope.js'))).toBeUndefined();
  });
});

describe('sourceGoneFilter', () => {
  test('skips a compiled file whose source is gone, when the app runs next to its source', () => {
    const isGone = sourceGoneFilter(compile('app.module.ts'));
    expect(isGone(compile('a.endpoint.ts'))).toBe(false);
    expect(isGone(compile('gone.endpoint.ts', { source: false }))).toBe(true);
  });

  test('skips nothing where there is no source tree, as in a deployment', () => {
    const isGone = sourceGoneFilter(compile('app.module.ts', { source: false }));
    expect(isGone(compile('gone.endpoint.ts', { source: false }))).toBe(false);
  });

  test('skips nothing when the app has no source maps', () => {
    const app = path.join(dist, 'app.module.js');
    write(app, 'export {};\n');
    const isGone = sourceGoneFilter(app);
    expect(isGone(compile('gone.endpoint.ts', { source: false }))).toBe(false);
  });

  test('keeps a compiled file that has no source map of its own', () => {
    const isGone = sourceGoneFilter(compile('app.module.ts'));
    const js = path.join(dist, 'plain.endpoint.js');
    write(js, 'export {};\n');
    expect(isGone(js)).toBe(false);
  });

  test('skips nothing for an app run from source', () => {
    const app = path.join(src, 'app.module.ts');
    write(app);
    const isGone = sourceGoneFilter(app);
    expect(isGone(path.join(src, 'a.endpoint.ts'))).toBe(false);
  });
});

describe('sourceDirectoryOf', () => {
  test('a folder beside a compiled file is the folder beside its source', () => {
    const js = compile('app.module.ts');
    expect(sourceDirectoryOf(path.join(dist, 'endpoints'), js)).toBe(path.join(src, 'endpoints'));
  });

  test('a folder beside a source file is itself', () => {
    const ts = path.join(src, 'app.module.ts');
    expect(sourceDirectoryOf(path.join(src, 'endpoints'), ts)).toBe(path.join(src, 'endpoints'));
  });

  test('a folder beside a compiled file with no source map is itself', () => {
    const js = path.join(dist, 'app.module.js');
    write(js, 'export {};\n');
    expect(sourceDirectoryOf(path.join(dist, 'endpoints'), js)).toBe(path.join(dist, 'endpoints'));
  });
});
