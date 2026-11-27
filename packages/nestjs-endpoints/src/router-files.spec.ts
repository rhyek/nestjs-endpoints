import path from 'node:path';
import type { DynamicModule } from '@nestjs/common';
import { ApplicationConfig } from '@nestjs/core';
import { RoutePathFactory } from '@nestjs/core/router/route-path-factory.js';
import { fixtures, nestedIn, pathOf, pathsOf, start } from '../test/routing';
import { descriptorOf } from './descriptors';
import { EndpointRouter } from './endpoint-router';

const under = (name: string) => path.join(fixtures, name);

const namespacesOf = (module: DynamicModule) =>
  (module.controllers ?? []).map((c) => descriptorOf(c)!.namespaceChain);

describe('routers in files of their own', () => {
  test("an endpoint in a child router's folder built with the `endpoint` of the router above fails", async () => {
    const { default: parent } = await import('../test/fixtures/routing/wrong-builder/router');
    await expect(parent).rejects.toThrow(
      /wrong-builder[/\\]kid[/\\]list\.endpoint\.ts is built with the endpoint of .*wrong-builder[/\\]router\.ts but is owned by .*wrong-builder[/\\]kid[/\\]router\.ts\. Build it with the `endpoint` of the router module that owns it\./,
    );
  });

  test('a child under the folder its parent looks in has the base path of that folder', async () => {
    const { default: rooted } = await import('../test/fixtures/routing/rooted/router');
    const module = await rooted;
    // `rooted/endpoints/` is where the parent looks: no segment of the URL.
    expect(pathsOf(module)).toEqual(['rooted/list']);
    expect(nestedIn(module).map(pathsOf)).toEqual([['rooted/kids/view']]);
  });

  test("a router file named as `shop.router.module.ts` is its folder's router, with its name", async () => {
    const module = await EndpointRouter.create({ rootDirectory: under('third-rank') });
    const [shop] = nestedIn(module);
    expect(pathsOf(shop!)).toEqual(['shop/list']);
    expect(namespacesOf(shop!)).toEqual([['shop']]);
  });

  test('an `endpoint.ts` at the root of a router at `/` is served at `/`', async () => {
    const module = await EndpointRouter.create({
      rootDirectory: under('root-endpoint'),
      basePath: '/',
    });
    const [root] = module.controllers!;
    expect(pathOf(root!)).toBe('');
    // As NestJS reads the path of a controller.
    expect(
      new RoutePathFactory(new ApplicationConfig()).create({
        ctrlPath: pathOf(root!),
        methodPath: '',
      }),
    ).toEqual(['/']);
    expect(descriptorOf(root!)).toMatchObject({ path: '/' });
  });

  test('a router at the root of the URLs still takes the namespace of its folder', async () => {
    const module = await EndpointRouter.create({ rootDirectory: under('ns-root') });
    const [shop] = nestedIn(module);
    expect(pathsOf(shop!)).toEqual(['list']);
    expect(namespacesOf(shop!)).toEqual([['shop']]);
  });

  test('`namespace: true` in a folder whose name is no name for a namespace fails', async () => {
    await expect(EndpointRouter.create({ rootDirectory: under('odd-names') })).rejects.toThrow(
      /odd-names[/\\]2fa[/\\]router\.ts: its namespace, "2fa", is not a name for a namespace: .* Give `namespace` a string\./,
    );
  });

  test('a router made with create() under another has none of its providers', async () => {
    const { default: outer } = await import('../test/fixtures/routing/no-inherit/outer/router');
    // The endpoint of the router under it injects a provider only the outer one has.
    await expect(start(outer)).rejects.toThrow(/Nest can't resolve dependencies[\s\S]*Access/);
  });

  test('a file named as a router file that throws what is no Error fails with it, and why it was loaded', async () => {
    const failure = await EndpointRouter.create({ rootDirectory: under('thrown') }).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    expect(failure?.message).toMatch(
      /loaded .*thrown[/\\]string[/\\]router\.ts, which has the name of a router file, to see whether it is one, and it threw: not an Error$/,
    );
    expect(failure?.cause).toBe('not an Error');
  });

  test('an endpoint a router both finds and lists is one endpoint of it', async () => {
    const module = await EndpointRouter.create({
      rootDirectory: under('basic'),
      endpoints: () => [import('../test/fixtures/routing/basic/a.endpoint')],
    });
    expect(pathsOf(module)).toEqual(['a', 'b']);
  });

  test("a router a file exports by name is the app's to import: the router above gives it its place, and nothing else", async () => {
    const above = await EndpointRouter.create({
      rootDirectory: under('by-hand'),
      basePath: 'above',
    });
    expect(nestedIn(above)).toEqual([]);
    const { kept } = await import('../test/fixtures/routing/by-hand/kept/router');
    expect(pathsOf(await kept)).toEqual(['above/kept/list']);
  });
});
