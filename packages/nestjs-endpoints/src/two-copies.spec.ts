import path from 'node:path';
import { Injectable, Logger, type Type } from '@nestjs/common';
import { ApplicationConfig, ModulesContainer } from '@nestjs/core';
import { empty, fixtures, pathOf, pathsOf, start } from '../test/routing';
import { rootOf } from './app-root';
import { tagDescriptions } from './codegen/hash';
import { collectDescriptors } from './descriptors';
import { endpoint } from './endpoint-fn';
import { EndpointRouter } from './endpoint-router';
import { NestjsEndpoints } from './nestjs-endpoints';

// A process may load the package from two places: an app's own copy, and one a library of its
// monorepo resolved for itself. What either makes is the other's own.

/**
 * A second evaluation of the package: another copy, as far as its modules can tell. The files
 * a router imports from here on are evaluated with it too, as files of a library are.
 */
async function anotherCopy() {
  vi.resetModules();
  return import('./index');
}

afterEach(() => {
  vi.restoreAllMocks();
});

const descriptorsOf = (app: Awaited<ReturnType<typeof start>>) =>
  collectDescriptors(app.get(ModulesContainer), app.get(ApplicationConfig));

describe('a router another copy of the package made', () => {
  test("is in an app beside this copy's root: its endpoints are described with the root's", async () => {
    const other = await anotherCopy();
    const own = endpoint.query({ path: 'own', handler: () => null });
    const shared = other.EndpointRouter.create({
      rootDirectory: empty,
      basePath: 'shared',
      namespace: 'shared',
      description: 'What the apps share',
      endpoints: (): Type[] => [ping],
    });
    const ping = shared.endpoint.query({ path: 'ping', handler: () => null });
    const app = await start(
      NestjsEndpoints.forRoot({ router: { rootDirectory: empty, endpoints: [own] } }),
      shared,
    );
    expect(
      descriptorsOf(app).map(({ path, namespaceChain }) => [path, namespaceChain.join('.')]),
    ).toEqual([
      ['/own', ''],
      ['/shared/ping', 'shared'],
    ]);
    expect(tagDescriptions().get('shared')).toBe('What the apps share');
  });

  test('is the root this copy reads, when the other made the root', async () => {
    const other = await anotherCopy();
    const clients = () => [];
    const app = await start(
      other.NestjsEndpoints.forRoot({ router: { rootDirectory: empty, endpoints: [] }, clients }),
      EndpointRouter.create({ rootDirectory: empty, endpoints: [] }),
    );
    expect(rootOf(app.get(ModulesContainer))?.clients).toBe(clients);
  });

  test('counts as a router of the app: two with no root fail, as two of one copy do', async () => {
    const other = await anotherCopy();
    await expect(
      start(
        EndpointRouter.create({ rootDirectory: empty, endpoints: [] }),
        other.EndpointRouter.create({ rootDirectory: empty, endpoints: [] }),
      ),
    ).rejects.toThrow('this app has 2 routers and no root');
  });
});

describe('a router another copy of the package made, which a router of this copy lists', () => {
  test('is under it, and has its context and providers', async () => {
    @Injectable()
    class Clock {}
    const other = await anotherCopy();
    const shared = other.EndpointRouter.create({
      rootDirectory: empty,
      basePath: 'shared',
      expects: { clock: other.EndpointRouter.given<Clock>() },
      endpoints: (): Type[] => [ping],
    });
    const ping = shared.endpoint.query({
      path: 'ping',
      handler: ({ clock }) => clock instanceof Clock,
    });
    const app = await start(
      NestjsEndpoints.forRoot({
        router: {
          rootDirectory: empty,
          basePath: 'api',
          providers: [Clock],
          context: { inject: { clock: Clock } },
          routers: [shared.register({ basePath: 'common' })],
        },
      }),
    );
    expect(pathOf(ping)).toBe('/api/common/ping');
    expect(await app.get(ping, { strict: false }).invoke()).toBe(true);
  });
});

describe('an endpoint another copy of the package built', () => {
  test("is mounted by this copy's router that lists it, under its base path", async () => {
    const other = await anotherCopy();
    const listed = other.endpoint.query({ path: 'listed', handler: () => null });
    const module = await EndpointRouter.create({
      rootDirectory: empty,
      basePath: 'api',
      endpoints: [listed],
    });
    expect(pathsOf(module)).toEqual(['/api/listed']);
  });

  test("is mounted by this copy's router that finds its file, where the folder places it", async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    // The folder's files are evaluated with the other copy, whose `endpoint` they import.
    await anotherCopy();
    const module = await EndpointRouter.create({ rootDirectory: path.join(fixtures, 'basic') });
    expect(pathsOf(module)).toEqual(['a', 'b']);
    expect(warn).not.toHaveBeenCalled();
  });

  test('is an endpoint of an app that mounts it by hand', async () => {
    const other = await anotherCopy();
    const byHand = other.endpoint.query({ path: 'by-hand', handler: () => null });
    const app = await start(
      NestjsEndpoints.forRoot({ router: { rootDirectory: empty, endpoints: [] } }),
      { module: class ByHandModule {}, controllers: [byHand] },
    );
    expect(descriptorsOf(app).map(({ path }) => path)).toEqual(['/by-hand']);
    expect(pathOf(byHand)).toBe('/by-hand');
  });
});
