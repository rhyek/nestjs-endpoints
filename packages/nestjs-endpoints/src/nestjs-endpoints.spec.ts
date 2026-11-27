import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DynamicModule, Logger, Module } from '@nestjs/common';
import { AbstractHttpAdapter, NestFactory } from '@nestjs/core';
import blogRouter from '../test/fixtures/routing/siblings/blog/router.module';
import teamRouter from '../test/fixtures/routing/siblings/team/router.module';
import { fixtures, pathsOf } from '../test/routing';
import type { ClientOptions } from './codegen/clients';
import { hashHeader } from './codegen/hash';
import { generateAxiosClient } from './codegen/kubb/generate';
import { EndpointRouter } from './endpoint-router';
import { NestjsEndpoints } from './nestjs-endpoints';
import { shown, stripExtension } from './routing-files';
import { closeRoutingFileWatchers } from './watch';

vi.mock('./codegen/kubb/generate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./codegen/kubb/generate')>()),
  generateAxiosClient: vi.fn(),
}));

const generate = vi.mocked(generateAxiosClient);

const basic = { rootDirectory: path.join(fixtures, 'basic') };

/** Starts an app made of `imports`, short of listening. */
async function start(...imports: Promise<DynamicModule>[]) {
  @Module({ imports })
  class AppModule {}
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });
  await app.close();
  return app;
}

describe('NestjsEndpoints.forRoot', () => {
  test('creates the root router, with its root directory relative to the file that calls it', async () => {
    const root = NestjsEndpoints.forRoot({
      router: { rootDirectory: '../test/fixtures/routing/basic' },
    });
    expect(pathsOf(await root)).toEqual(['a', 'b']);
    await expect(start(root)).resolves.toBeDefined();
  });

  test('returns the root router, with its `endpoint` builders', () => {
    const root = NestjsEndpoints.forRoot({ router: basic });
    expect(root.endpoint.query).toBeTypeOf('function');
    expect(root.endpoint.mutation).toBeTypeOf('function');
  });

  test('leaves the routers an app imports beside it as they are', async () => {
    await expect(
      start(NestjsEndpoints.forRoot({ router: basic }), blogRouter, teamRouter),
    ).resolves.toBeDefined();
  });

  test('needs no router of its own in an app made of routers it imports', async () => {
    const root = NestjsEndpoints.forRoot();
    expect((await root).controllers ?? []).toEqual([]);
    await expect(start(root, blogRouter, teamRouter)).resolves.toBeDefined();
  });

  test('called twice in an app, fails the start', async () => {
    await expect(
      start(NestjsEndpoints.forRoot({ router: basic }), NestjsEndpoints.forRoot()),
    ).rejects.toThrow(
      'nestjs-endpoints: NestjsEndpoints.forRoot() is called more than once. An app calls it once, in its root module.',
    );
  });

  test('called twice in an app, fails the start, with no router in either call too', async () => {
    await expect(start(NestjsEndpoints.forRoot(), NestjsEndpoints.forRoot())).rejects.toThrow(
      'nestjs-endpoints: NestjsEndpoints.forRoot() is called more than once. An app calls it once, in its root module.',
    );
  });

  test('is counted per app: two apps in one process each have their own', async () => {
    await expect(start(NestjsEndpoints.forRoot({ router: basic }))).resolves.toBeDefined();
    await expect(start(NestjsEndpoints.forRoot(), blogRouter)).resolves.toBeDefined();
  });
});

describe('watch', () => {
  // Where an app under this package keeps the file `node --watch` restarts for.
  const cache = path.resolve(import.meta.dirname, '../node_modules/.cache/nestjs-endpoints');
  const watched = () =>
    fs.existsSync(cache)
      ? fs.readdirSync(cache).flatMap((name) => fs.readFileSync(path.join(cache, name), 'utf8'))
      : [];

  beforeEach(() => {
    fs.rmSync(cache, { recursive: true, force: true });
  });

  afterEach(() => {
    closeRoutingFileWatchers();
    fs.rmSync(cache, { recursive: true, force: true });
  });

  test('is off unless the app turns it on: nothing is watched or written', async () => {
    await start(NestjsEndpoints.forRoot({ router: basic }), blogRouter);
    await start(blogRouter);
    expect(watched()).toEqual([]);
  });

  test('turned on, watches the root router and the routers beside it', async () => {
    await start(NestjsEndpoints.forRoot({ router: basic, watch: true }), blogRouter);
    const files = watched().join('\n');
    expect(files).toContain(path.join(fixtures, 'basic/a.endpoint.ts'));
    expect(files).toContain(path.join(fixtures, 'basic/shop/router.module.ts'));
    expect(files).toContain(path.join(fixtures, 'siblings/blog/list.endpoint.ts'));
    expect(files).not.toContain(path.join(fixtures, 'siblings/team/list.endpoint.ts'));
  });

  test("turned on, watches the folders of a router the root's router lists, which are not under its own", async () => {
    const library = (await import('../test/fixtures/routing/library/router')).default;
    await start(NestjsEndpoints.forRoot({ router: { ...basic, routers: [library] }, watch: true }));
    const files = watched().join('\n');
    expect(files).toContain(path.join(fixtures, 'basic/a.endpoint.ts'));
    expect(files).toContain(path.join(fixtures, 'library/list.endpoint.ts'));
    expect(files).toContain(path.join(fixtures, 'library/inner/view.endpoint.ts'));
  });

  test('turned off, watches no folder of a router that is listed either', async () => {
    const library = EndpointRouter.create({
      rootDirectory: path.join(fixtures, 'siblings/team'),
      basePath: 'listed-team',
    });
    await start(NestjsEndpoints.forRoot({ router: { ...basic, routers: [library] } }));
    expect(watched()).toEqual([]);
  });

  test('turned on in a root with no router, watches the routers beside it alone', async () => {
    await start(NestjsEndpoints.forRoot({ watch: true }), blogRouter);
    expect(watched()).toEqual([
      expect.stringContaining(path.join(fixtures, 'siblings/blog/list.endpoint.ts')),
    ]);
  });
});

describe('clients', () => {
  let dir: string;
  let client: ClientOptions;

  beforeEach(() => {
    // As `nest start` runs the app: it sets no NODE_ENV, which Vitest sets to `test`.
    vi.stubEnv('NODE_ENV', undefined);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nestjs-endpoints-root-'));
    client = { type: 'axios', outputFile: path.join(dir, 'client.ts') };
    generate.mockReset();
    // What a build writes: the wrapper with its hash, and the output directory.
    generate.mockImplementation(async ({ outputFile, hash }) => {
      fs.mkdirSync(stripExtension(outputFile), { recursive: true });
      fs.writeFileSync(outputFile, hashHeader(hash) + 'export {};\n');
    });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  /** The paths of the endpoints each client was generated from. */
  const generated = () =>
    generate.mock.calls.map(([{ outputFile, descriptors }]) => ({
      outputFile,
      paths: descriptors.map((d) => d.path),
    }));

  test('given as a list, are generated as the app starts', async () => {
    await start(NestjsEndpoints.forRoot({ router: basic, clients: [client] }));
    expect(generated().map(({ outputFile }) => outputFile)).toEqual([client.outputFile]);
  });

  test('given as a function, are what it returns, and it is called once', async () => {
    const clients = vi.fn(() => [client]);
    await start(NestjsEndpoints.forRoot({ router: basic, clients }));
    expect(clients).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test('given as a function, may be a promise of them', async () => {
    await start(NestjsEndpoints.forRoot({ router: basic, clients: async () => [client] }));
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test('with `generateClientsOnStart` off, are not generated, and the function is not called', async () => {
    const clients = vi.fn(() => [client]);
    await start(NestjsEndpoints.forRoot({ router: basic, clients, generateClientsOnStart: false }));
    expect(clients).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  describe('are generated as the app starts by default', () => {
    test.each([
      ['unset', undefined],
      ['development', 'development'],
    ])('when NODE_ENV is %s', async (_, value) => {
      vi.stubEnv('NODE_ENV', value);
      await start(NestjsEndpoints.forRoot({ router: basic, clients: [client] }));
      expect(generate).toHaveBeenCalledTimes(1);
    });

    test.each(['test', 'production', 'staging', ''])(
      'and not when NODE_ENV is %j, which calls no `clients` function',
      async (value) => {
        vi.stubEnv('NODE_ENV', value);
        const clients = vi.fn(() => [client]);
        await start(NestjsEndpoints.forRoot({ router: basic, clients }));
        expect(clients).not.toHaveBeenCalled();
        expect(generate).not.toHaveBeenCalled();
      },
    );

    test('unless `generateClientsOnStart` is on', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      await start(
        NestjsEndpoints.forRoot({ router: basic, clients: [client], generateClientsOnStart: true }),
      );
      expect(generate).toHaveBeenCalledTimes(1);
    });

    test('or off', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      await start(
        NestjsEndpoints.forRoot({
          router: basic,
          clients: [client],
          generateClientsOnStart: false,
        }),
      );
      expect(generate).not.toHaveBeenCalled();
    });
  });

  test('are written once: an app that starts again with nothing changed writes none', async () => {
    await start(NestjsEndpoints.forRoot({ router: basic, clients: [client] }));
    await start(NestjsEndpoints.forRoot({ router: basic, clients: [client] }));
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test('are generated in a root with no router, from the routers beside it', async () => {
    await start(NestjsEndpoints.forRoot({ clients: [client] }), blogRouter);
    expect(generated()).toEqual([{ outputFile: client.outputFile, paths: ['/blog/list'] }]);
  });

  test('are logged as they are written, and not when they are up to date', async () => {
    const log = vi.spyOn(Logger.prototype, 'log');
    const written = () => log.mock.calls.filter(([message]) => /client/.test(String(message)));
    await start(NestjsEndpoints.forRoot({ router: basic, clients: [client] }));
    expect(written()).toEqual([[`Generated the axios client ${shown(client.outputFile)}`]]);
    log.mockClear();
    await start(NestjsEndpoints.forRoot({ router: basic, clients: [client] }));
    expect(written()).toEqual([]);
  });

  test('are not generated as the app is created: what `main.ts` sets on it comes first', async () => {
    @Module({ imports: [NestjsEndpoints.forRoot({ router: basic, clients: [client] })] })
    class AppModule {}
    // `NestFactory.create` takes an object with `patch` for an HTTP adapter.
    const adapter = { patch() {}, initHttpServer() {}, getHttpServer: () => ({}) };
    await NestFactory.create(AppModule, adapter as unknown as AbstractHttpAdapter, {
      logger: false,
    });
    expect(generate).not.toHaveBeenCalled();
  });

  test('given as a function that throws, fail the start, and say whose it is', async () => {
    const clients = () => {
      throw new Error('no such folder');
    };
    await expect(start(NestjsEndpoints.forRoot({ router: basic, clients }))).rejects.toThrow(
      'nestjs-endpoints: the `clients` of NestjsEndpoints.forRoot() threw: no such folder',
    );
  });

  test('that are not a list fail the start', async () => {
    const clients = (() => ({ type: 'axios' })) as unknown as () => ClientOptions[];
    await expect(start(NestjsEndpoints.forRoot({ router: basic, clients }))).rejects.toThrow(
      'nestjs-endpoints: the `clients` of NestjsEndpoints.forRoot() are not a list of clients.',
    );
  });
});

describe('an app with no NestjsEndpoints.forRoot', () => {
  test('starts with one router, which acts as its root', async () => {
    await expect(start(blogRouter)).resolves.toBeDefined();
  });

  test('starts with one router that has nested routers: only the top one counts', async () => {
    // `basic/shop` has a router module of its own.
    await expect(start(EndpointRouter.create(basic))).resolves.toBeDefined();
  });

  test('fails the start with two routers, asking for forRoot', async () => {
    await expect(start(blogRouter, teamRouter)).rejects.toThrow(
      'nestjs-endpoints: this app has 2 routers and no root. Add NestjsEndpoints.forRoot({ router: { … } }) to its root module; further routers stay as EndpointRouter.create().',
    );
  });

  test('counts a router that only lists its endpoints', async () => {
    await expect(
      start(blogRouter, EndpointRouter.create({ ...basic, endpoints: [] })),
    ).rejects.toThrow(/this app has 2 routers and no root/);
  });
});
