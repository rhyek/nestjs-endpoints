import fs from 'node:fs';
import path from 'node:path';
import { DynamicModule, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import blogRouter from '../test/fixtures/routing/siblings/blog/router.module';
import teamRouter from '../test/fixtures/routing/siblings/team/router.module';
import { fixtures, pathsOf } from '../test/routing';
import { EndpointRouter } from './endpoint-router';
import { NestjsEndpoints } from './nestjs-endpoints';
import { closeRoutingFileWatchers } from './watch';

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

  test('turned on in a root with no router, watches the routers beside it alone', async () => {
    await start(NestjsEndpoints.forRoot({ watch: true }), blogRouter);
    expect(watched()).toEqual([
      expect.stringContaining(path.join(fixtures, 'siblings/blog/list.endpoint.ts')),
    ]);
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
