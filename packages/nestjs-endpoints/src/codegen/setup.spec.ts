import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { endpoint } from '../endpoint-fn.js';
import { hashHeader } from './hash.js';
import { generateAxiosClient, outputDirFor } from './kubb/generate.js';
import { setupCodegen } from './setup.js';

vi.mock('./kubb/generate.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./kubb/generate.js')>()),
  generateAxiosClient: vi.fn(),
}));

const generate = vi.mocked(generateAxiosClient);

/** What a build writes: the wrapper with its hash, and the output dir. */
async function writeClient(outputFile: string, hash: string) {
  await mkdir(outputDirFor(outputFile), { recursive: true });
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

const run = () =>
  setupCodegen(app, { clients: [{ type: 'axios', outputFile }] });

test('an unchanged client is not regenerated', async () => {
  generate.mockImplementation(({ outputFile, hash }) =>
    writeClient(outputFile, hash),
  );
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
  await expect(run()).rejects.toThrow(
    /failed to generate the axios client .*: a plugin failed/,
  );
  await expect(stat(outputFile)).rejects.toThrow();
  await expect(run()).rejects.toThrow(/a plugin failed/);
  expect(generate).toHaveBeenCalledTimes(2);
});
