import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { defineConfig } from 'oxlint';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { base, commonJsRestrictedImports } from './oxlint';

// Runs the real oxlint (and tsgolint, for the type-aware rules) over a fixture whose
// `oxlint.config.ts` extends this package the way a consumer's does. oxlint refuses a config that
// names a rule it does not have, so an upgrade that renames one fails here first.

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const oxlintBin = join(packageDir, 'node_modules/.bin/oxlint');

const files: Record<string, string> = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'nodenext',
      target: 'es2024',
      jsx: 'react-jsx',
      noEmit: true,
      typeRoots: [join(packageDir, 'node_modules/@types')],
      types: ['node'],
    },
    include: ['src'],
  }),
  // Stands in for TanStack Router's types: `only-throw-error` matches by declaring package.
  'node_modules/@tanstack/router-core/package.json': JSON.stringify({
    name: '@tanstack/router-core',
    types: './index.d.ts',
  }),
  'node_modules/@tanstack/router-core/index.d.ts': [
    'export type Redirect = { href: string };',
    'export declare function redirect(opts: { to: string }): Redirect;',
  ].join('\n'),
  'oxlint.config.ts': [
    `import { base, commonJsRestrictedImports, react, ignorePatterns } from ${JSON.stringify(join(packageDir, 'src/oxlint.ts'))};`,
    'export default {',
    '  extends: [base, react],',
    '  ignorePatterns: [...ignorePatterns, "src/gen/**"],',
    '  overrides: [',
    // A consumer's own `no-restricted-imports`, with and without the shared paths spread in.
    '    {',
    '      files: ["src/own-paths/**"],',
    '      rules: {',
    '        "eslint/no-restricted-imports": [',
    '          "error",',
    '          { paths: [...commonJsRestrictedImports, "node:vm"] },',
    '        ],',
    '      },',
    '    },',
    '    {',
    '      files: ["src/replaced-paths/**"],',
    '      rules: { "eslint/no-restricted-imports": ["error", { paths: ["node:vm"] }] },',
    '    },',
    '  ],',
    '};',
  ].join('\n'),
  'src/throws.ts': [
    "import { redirect } from '@tanstack/router-core';",
    '',
    "export function toHome(): never { throw redirect({ to: '/' }); }",
    'export function plain(): never { throw { code: 1 }; }',
  ].join('\n'),
  'src/flow.ts': [
    "type Kind = 'a' | 'b';",
    'export function size(kind: Kind, n: number): number {',
    '  switch (kind) {',
    "    case 'a':",
    '      n += 1;',
    '  }',
    '  switch (n) {',
    '    case 1:',
    '      n += 1;',
    '    case 2:',
    '      return n;',
    '  }',
    '  console.log(n);',
    '  return n;',
    '}',
  ].join('\n'),
  'src/view.tsx': [
    "import { useState } from 'react';",
    '',
    'export function View({ open }: { open: boolean }) {',
    '  if (open) {',
    '    const [n] = useState(1);',
    '    return <div>{n}</div>;',
    '  }',
    '  return <button>close</button>;',
    '}',
  ].join('\n'),
  'src/view.spec.ts': [
    "import { expect, it } from 'vitest';",
    '',
    "it('logs', () => { console.log('x'); expect(1).toBe(1); });",
  ].join('\n'),
  'src/runner.spec.ts': [
    "import { test } from 'node:test';",
    '',
    "test('runs', () => {});",
    'export async function later(): Promise<void> {}',
    'later();',
  ].join('\n'),
  'src/gen/out.ts': 'console.log(1);',
  // One CommonJS form per file, each read by its own test.
  'src/cjs/create-require.ts': [
    "import { createRequire } from 'node:module';",
    '',
    'export const load = createRequire(import.meta.url);',
  ].join('\n'),
  'src/cjs/create-require-bare.ts': [
    "import { createRequire } from 'module';",
    '',
    'export const load = createRequire(import.meta.url);',
  ].join('\n'),
  'src/cjs/require.ts': "export const fs: unknown = require('node:fs');",
  'src/cjs/require-resolve.ts': "export const path = require.resolve('node:fs');",
  'src/cjs/import-equals.ts': ["import fs = require('node:fs');", '', 'export { fs };'].join('\n'),
  'src/cjs/module-exports.ts': 'module.exports = { size: 1 };',
  'src/cjs/exports.ts': 'exports.size = 1;',
  'src/cjs/dirname.ts': 'export const here = [__dirname, __filename];',
  'src/own-paths/create-require.ts': [
    "import { createRequire } from 'node:module';",
    "import { runInThisContext } from 'node:vm';",
    '',
    'export const load = [createRequire, runInThisContext];',
  ].join('\n'),
  'src/replaced-paths/create-require.ts': [
    "import { createRequire } from 'node:module';",
    "import { runInThisContext } from 'node:vm';",
    '',
    'export const load = [createRequire, runInThisContext];',
  ].join('\n'),
};

type Diagnostic = { code: string; filename: string; message: string };
let fixture: string;
let diagnostics: Diagnostic[];

beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'oxc-config-'));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(fixture, path)), { recursive: true });
    await writeFile(join(fixture, path), content);
  }
  // oxlint exits 1 when it reports anything; the report is what the tests read.
  const { stdout } = await promisify(execFile)(oxlintBin, ['-f', 'json', 'src'], {
    cwd: fixture,
  }).catch((error: unknown) => {
    const { stdout = '', stderr = '' } = error as { stdout?: string; stderr?: string };
    if (!stdout.startsWith('{')) {
      throw new Error(`oxlint failed: ${stderr}${stdout}`);
    }
    return { stdout };
  });
  diagnostics = (JSON.parse(stdout) as { diagnostics: Diagnostic[] }).diagnostics;
}, 30_000);

afterAll(async () => {
  await rm(fixture, { recursive: true, force: true });
});

const codesIn = (file: string) =>
  diagnostics
    .filter((d) => d.filename === file)
    .map((d) => d.code)
    .sort();

test('the recommended rules beyond correctness fire, type-aware ones included', () => {
  expect(codesIn('src/flow.ts')).toEqual([
    'eslint(no-console)',
    'eslint(no-fallthrough)',
    'typescript(switch-exhaustiveness-check)',
  ]);
});

test("TanStack Router's redirect may be thrown, a plain object may not", () => {
  const throws = diagnostics.filter((d) => d.filename === 'src/throws.ts');
  expect(throws.map((d) => d.code)).toEqual(['typescript(only-throw-error)']);
});

test('react: a conditional hook is reported once, JSX needs no React in scope', () => {
  expect(codesIn('src/view.tsx')).toEqual([
    'react(button-has-type)',
    'react-hooks(rules-of-hooks)',
  ]);
});

test('specs may log, and must use test()', () => {
  expect(codesIn('src/view.spec.ts')).toEqual(['vitest(consistent-test-it)']);
});

test("node:test's test() may float, any other promise may not", () => {
  expect(codesIn('src/runner.spec.ts')).toEqual(['typescript(no-floating-promises)']);
});

test("the consumer's ignorePatterns, spread with the shared ones, are honoured", () => {
  expect(codesIn('src/gen/out.ts')).toEqual([]);
});

test.each([
  ['create-require.ts', ['eslint(no-restricted-imports)']],
  ['create-require-bare.ts', ['eslint(no-restricted-imports)', 'unicorn(prefer-node-protocol)']],
  [
    'require.ts',
    ['import(no-commonjs)', 'typescript(no-require-imports)', 'unicorn(prefer-module)'],
  ],
  ['require-resolve.ts', ['unicorn(prefer-module)']],
  ['import-equals.ts', ['typescript(no-require-imports)']],
  // oxlint's `no-commonjs` reports `module.exports =` twice, at the same position.
  ['module-exports.ts', ['import(no-commonjs)', 'import(no-commonjs)', 'unicorn(prefer-module)']],
  ['exports.ts', ['import(no-commonjs)', 'unicorn(prefer-module)']],
  ['dirname.ts', ['unicorn(prefer-module)', 'unicorn(prefer-module)']],
])('ES modules only: src/cjs/%s', (file, codes) => {
  expect(codesIn(`src/cjs/${file}`)).toEqual(codes);
});

test("a consumer's own no-restricted-imports keeps the createRequire ban by spreading it", () => {
  expect(codesIn('src/own-paths/create-require.ts')).toEqual([
    'eslint(no-restricted-imports)',
    'eslint(no-restricted-imports)',
  ]);
  // Without the spread, the consumer's paths replace the shared ones.
  expect(codesIn('src/replaced-paths/create-require.ts')).toEqual([
    'eslint(no-restricted-imports)',
  ]);
});

test('commonJsRestrictedImports is what base bans', () => {
  expect(base.rules['eslint/no-restricted-imports']).toEqual([
    'error',
    { paths: commonJsRestrictedImports },
  ]);
  expect(commonJsRestrictedImports.map(({ name, importNames }) => [name, importNames])).toEqual([
    ['node:module', ['createRequire']],
    ['module', ['createRequire']],
  ]);
});

// A consumer's config spreads the constant into its own `paths`; this compiles under `pnpm
// typecheck` only while the constant's type fits oxlint's.
export const consumerConfig = defineConfig({
  rules: {
    'eslint/no-restricted-imports': [
      'error',
      { paths: [...commonJsRestrictedImports, { name: 'node:vm', message: 'No eval.' }] },
    ],
  },
});
