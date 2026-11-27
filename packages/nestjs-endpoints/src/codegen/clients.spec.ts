import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Module } from '@nestjs/common';
import { ApplicationConfig, ModulesContainer, NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { endpoint } from '../endpoint-fn';
import { stripExtension } from '../routing-files';
import { ClientOptions, generateClients } from './clients';
import { hashHeader } from './hash';
import { generateAxiosClient } from './kubb/generate';

vi.mock('./kubb/generate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./kubb/generate')>()),
  generateAxiosClient: vi.fn(),
}));

const generate = vi.mocked(generateAxiosClient);

let dir: string;
let app: { modules: ModulesContainer; config: ApplicationConfig };
let close: () => Promise<void>;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'nestjs-endpoints-clients-'));
  @Module({
    controllers: [endpoint.query({ path: '/greet', output: z.string(), handler: () => 'hi' })],
  })
  class AppModule {}
  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
  app = { modules: context.get(ModulesContainer), config: context.get(ApplicationConfig) };
  close = () => context.close();
  generate.mockReset();
  // What a build writes: the wrapper with its hash, and the output directory.
  generate.mockImplementation(async ({ outputFile, hash }) => {
    await mkdir(stripExtension(outputFile), { recursive: true });
    await writeFile(outputFile, hashHeader(hash) + 'export {};\n');
  });
});

afterEach(async () => {
  await close();
  await rm(dir, { recursive: true, force: true });
});

const axios = (name: string): ClientOptions => ({
  type: 'axios',
  outputFile: path.join(dir, name),
});
const run = (clients: ClientOptions[], force = false) =>
  generateClients(app, clients, { force, by: 'the caller' });

test('resolves to the clients it wrote, and to none once they are up to date', async () => {
  const clients = [axios('a.ts'), { ...axios('b.ts'), namespaces: ['x'] }];
  expect(await run(clients)).toEqual(clients);
  expect(await run(clients)).toEqual([]);
});

test('forced, writes a client that is up to date', async () => {
  await run([axios('a.ts')]);
  expect(await run([axios('a.ts')], true)).toEqual([axios('a.ts')]);
});

test('refuses two clients with one outputFile, before it writes any', async () => {
  await expect(run([axios('a.ts'), axios('a.ts')])).rejects.toThrow(
    `the caller: two clients have the "outputFile" "${path.join(dir, 'a.ts')}".`,
  );
  expect(generate).not.toHaveBeenCalled();
});

test('names its caller when it refuses an empty `namespaces`', async () => {
  await expect(run([{ ...axios('a.ts'), namespaces: [] }])).rejects.toThrow(
    /^the caller: client for ".*a\.ts" has an empty namespaces filter\./,
  );
});

test('names its caller when it refuses an outputFile with no extension', async () => {
  await expect(run([axios('a')])).rejects.toThrow(
    /^the caller: client "outputFile" must include a file extension/,
  );
});

// Each client's build removes what it finds in its folder that it did not write.
describe('refuses, before it writes any, two clients whose files would mix', () => {
  test('one outputFile, named two ways', async () => {
    const relative = path.relative(process.cwd(), path.join(dir, 'a.ts'));
    await expect(run([axios('a.ts'), { type: 'axios', outputFile: relative }])).rejects.toThrow(
      `the caller: two clients have the "outputFile" "${relative}".`,
    );
    expect(generate).not.toHaveBeenCalled();
  });

  test('one folder, from two extensions', async () => {
    const reactQuery: ClientOptions = { type: 'react-query', outputFile: path.join(dir, 'a.tsx') };
    await expect(run([axios('a.ts'), reactQuery])).rejects.toThrow(
      `the caller: the clients "${path.join(dir, 'a.ts')}" and "${path.join(dir, 'a.tsx')}" are written to one folder.`,
    );
    expect(generate).not.toHaveBeenCalled();
  });

  test.each([
    ['after', ['a.ts', 'a/b.ts']],
    ['before', ['a/b.ts', 'a.ts']],
  ])('one inside the folder of the other, listed %s it', async (_, names) => {
    await expect(run(names.map(axios))).rejects.toThrow(
      `the caller: the client "${path.join(dir, 'a/b.ts')}" is inside the folder of the client "${path.join(dir, 'a.ts')}".`,
    );
    expect(generate).not.toHaveBeenCalled();
  });

  test('but not two whose names only begin alike', async () => {
    await expect(run([axios('a.ts'), axios('ab.ts'), axios('a-b/c.ts')])).resolves.toHaveLength(3);
  });
});

test.each([
  ['nothing', undefined, 'undefined'],
  ['no outputFile', { type: 'axios' }, "{ type: 'axios' }"],
  [
    'an outputFile that is not a string',
    { type: 'axios', outputFile: 1 },
    "{ type: 'axios', outputFile: 1 }",
  ],
  [
    'no outputFile, in one line however much it holds',
    { type: 'react-query', options: { suspense: {}, infinite: { queryParam: 'cursor' } } },
    "{ type: 'react-query', options: { suspense: {}, infinite: { queryParam: 'cursor' } } }",
  ],
])('refuses a client that is %s, naming its caller', async (_, client, shown) => {
  await expect(run([client as unknown as ClientOptions])).rejects.toThrow(
    `the caller: a client is an object with a "type" and an "outputFile"; got ${shown}.`,
  );
});

test('refuses a client of a type there is none of, naming its caller', async () => {
  const client = { type: 'fetch', outputFile: path.join(dir, 'a.ts') };
  await expect(run([client as unknown as ClientOptions])).rejects.toThrow(
    `the caller: the client "${client.outputFile}" has the type 'fetch'; a client's type is "axios" or "react-query".`,
  );
});

// What the folder held stays until the build replaces it: a page that has the client open keeps
// running on it, and a build that fails leaves it there.
test('forced, removes nothing of a client before its build', async () => {
  await run([axios('a.ts')]);
  const kept = path.join(dir, 'a', 'kept.ts');
  await writeFile(kept, 'export {};\n');
  const found: boolean[] = [];
  generate.mockImplementation(async ({ outputFile }) => {
    found.push(existsSync(outputFile), existsSync(kept));
  });

  await run([axios('a.ts')], true);

  expect(found).toEqual([true, true]);
});

// Kubb's build throws one AggregateError for every plugin that failed, whose own message only
// counts them.
describe('a build that fails', () => {
  const failing = (...messages: string[]) => {
    generate.mockImplementation(async ({ outputFile, hash }) => {
      await writeFile(outputFile, hashHeader(hash) + 'export {};\n');
      throw new AggregateError(
        messages.map((message) => new Error(message)),
        `Build failed with ${messages.length} error(s)`,
      );
    });
  };
  const prefix = () =>
    `the caller: failed to generate the axios client "${path.join(dir, 'a.ts')}": `;

  test('removes the wrapper it wrote, so the next run builds it again', async () => {
    failing('a plugin failed');
    await expect(run([axios('a.ts')])).rejects.toThrow(prefix());
    expect(existsSync(path.join(dir, 'a.ts'))).toBe(false);
  });

  test("names each plugin's own error", async () => {
    failing('a plugin failed');
    await expect(run([axios('a.ts')])).rejects.toThrow(`${prefix()}a plugin failed`);
    failing('one failed', 'another failed');
    await expect(run([axios('a.ts')])).rejects.toThrow(`${prefix()}one failed; another failed`);
  });

  test("names an error that is not the build's as it is", async () => {
    generate.mockRejectedValue(new Error('disk full'));
    await expect(run([axios('a.ts')])).rejects.toThrow(`${prefix()}disk full`);
  });
});
