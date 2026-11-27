import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { endpoint } from '../endpoint-fn';
import { NestjsEndpoints } from '../nestjs-endpoints';
import { stripExtension } from '../routing-files';
import type { ClientOptions, ClientsOption } from './clients';
import { hashHeader } from './hash';
import { generateAxiosClient } from './kubb/generate';
import { setupCodegen } from './setup';

vi.mock('./kubb/generate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./kubb/generate')>()),
  generateAxiosClient: vi.fn(),
}));

const generate = vi.mocked(generateAxiosClient);

/** What a build writes: the wrapper with its hash, and the output dir. */
async function writeClient(outputFile: string, hash: string) {
  await mkdir(stripExtension(outputFile), { recursive: true });
  await writeFile(outputFile, hashHeader(hash) + 'export {};\n');
}

let dir: string;
let app: INestApplication;
let outputFile: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'nestjs-endpoints-setup-'));
  outputFile = path.join(dir, 'axios-client.ts');
  @Module({
    controllers: [
      endpoint.query({
        path: '/greet',
        input: z.object({ name: z.string() }),
        handler: () => null,
      }),
    ],
  })
  class AppModule {}
  app = (await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  })) as INestApplication;
  generate.mockReset();
});

afterEach(async () => {
  await app.close();
  await rm(dir, { recursive: true, force: true });
});

const run = () => setupCodegen(app, { clients: [{ type: 'axios', outputFile }] });

test('an unchanged client is not regenerated', async () => {
  generate.mockImplementation(({ outputFile, hash }) => writeClient(outputFile, hash));
  await run();
  await run();
  expect(generate).toHaveBeenCalledTimes(1);
});

test('a failed build leaves no wrapper, so the next run fails again', async () => {
  generate.mockImplementation(async ({ outputFile, hash }) => {
    // Kubb writes its files before the build reports a plugin's error.
    await writeClient(outputFile, hash);
    throw new Error('a plugin failed');
  });
  await expect(run()).rejects.toThrow(/failed to generate the axios client .*: a plugin failed/);
  await expect(stat(outputFile)).rejects.toThrow(/ENOENT/);
  await expect(run()).rejects.toThrow(/a plugin failed/);
  expect(generate).toHaveBeenCalledTimes(2);
});

test('names itself for `clients` that are not a list', async () => {
  const clients = { type: 'axios', outputFile } as unknown as ClientOptions[];
  await expect(setupCodegen(app, { clients })).rejects.toThrow(
    'nestjs-endpoints: the `clients` of setupCodegen() are not a list of clients.',
  );
});

describe('with no `clients`', () => {
  /** An app whose root declares `clients`, which it does not generate as it starts. */
  async function appWith(clients?: ClientsOption) {
    @Module({ imports: [NestjsEndpoints.forRoot({ clients, generateClientsOnStart: false })] })
    class RootModule {}
    await app.close();
    app = (await NestFactory.createApplicationContext(RootModule, {
      logger: false,
    })) as INestApplication;
  }

  beforeEach(() => {
    generate.mockImplementation(({ outputFile, hash }) => writeClient(outputFile, hash));
  });

  test('generates the clients the app declares in forRoot', async () => {
    await appWith(() => [{ type: 'axios', outputFile }]);
    await setupCodegen(app);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0].outputFile).toBe(outputFile);
  });

  test('regenerates them when forced', async () => {
    await appWith([{ type: 'axios', outputFile }]);
    await setupCodegen(app);
    await setupCodegen(app);
    await setupCodegen(app, { forceGenerate: true });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  const missing =
    'setupCodegen: pass `clients`, or declare them in NestjsEndpoints.forRoot({ clients }).';

  test('names forRoot for its `clients`, which it reads', async () => {
    await appWith(() => {
      throw new Error('no such folder');
    });
    await expect(setupCodegen(app)).rejects.toThrow(
      'nestjs-endpoints: the `clients` of NestjsEndpoints.forRoot() threw: no such folder',
    );
  });

  test('fails in an app with no forRoot', async () => {
    await expect(setupCodegen(app)).rejects.toThrow(missing);
  });

  test('fails in an app whose forRoot declares none', async () => {
    await appWith();
    await expect(setupCodegen(app)).rejects.toThrow(missing);
  });
});
