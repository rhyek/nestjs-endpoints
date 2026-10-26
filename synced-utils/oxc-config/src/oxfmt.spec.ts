import { format } from 'oxfmt';
import { expect, test } from 'vitest';
import { oxfmtConfig } from './oxfmt';

test('single quotes, trailing commas, and imports sorted in one block', async () => {
  const source = [
    'import { b } from "./b";',
    '',
    'import { readFile } from "node:fs/promises";',
    'import { z } from "zod";',
    'export const all = [readFile, z, b, "a long enough string to wrap the array", "and another one too"];',
    '',
  ].join('\n');
  const { code, errors } = await format('a.ts', source, oxfmtConfig);
  expect(errors).toEqual([]);
  expect(code).toBe(
    [
      "import { readFile } from 'node:fs/promises';",
      "import { z } from 'zod';",
      "import { b } from './b';",
      'export const all = [',
      '  readFile,',
      '  z,',
      '  b,',
      "  'a long enough string to wrap the array',",
      "  'and another one too',",
      '];',
      '',
    ].join('\n'),
  );
});

test("a file's header comment stays at the top while the imports under it are sorted", async () => {
  const source = [
    '// What this module is for.',
    "import { b } from './b';",
    "import { z } from 'zod';",
    'export const all = [b, z];',
    '',
  ].join('\n');
  const { code } = await format('a.ts', source, oxfmtConfig);
  expect(code).toBe(
    [
      '// What this module is for.',
      "import { z } from 'zod';",
      "import { b } from './b';",
      'export const all = [b, z];',
      '',
    ].join('\n'),
  );
});

test('a stylesheet stays among the relative imports, in name order', async () => {
  const source = [
    "import { b } from './b';",
    "import classes from './a.module.css';",
    "import { z } from 'zod';",
    'export const all = [b, classes, z];',
    '',
  ].join('\n');
  const { code } = await format('x.tsx', source, oxfmtConfig);
  expect(code).toBe(
    [
      "import { z } from 'zod';",
      "import classes from './a.module.css';",
      "import { b } from './b';",
      'export const all = [b, classes, z];',
      '',
    ].join('\n'),
  );
});

test('a side-effect import keeps its place: reflect-metadata stays above Nest', async () => {
  const source = [
    "import 'reflect-metadata';",
    "import { NestFactory } from '@nestjs/core';",
    "import { AppModule } from './app.module';",
    "import { a } from 'a';",
    'export const all = [NestFactory, AppModule, a];',
    '',
  ].join('\n');
  const { code } = await format('main.ts', source, oxfmtConfig);
  expect(code).toBe(
    [
      "import 'reflect-metadata';",
      "import { NestFactory } from '@nestjs/core';",
      "import { a } from 'a';",
      "import { AppModule } from './app.module';",
      'export const all = [NestFactory, AppModule, a];',
      '',
    ].join('\n'),
  );
});
