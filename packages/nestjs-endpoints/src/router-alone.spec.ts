import path from 'node:path';
import { Inject, type Type } from '@nestjs/common';
import { APP_GUARD, ModuleRef } from '@nestjs/core';
import { z } from 'zod';
import { Access } from '../test/fixtures/routing/context/access';
import { empty, fixtures, pathOf, start } from '../test/routing';
import { descriptorOf } from './descriptors';
import { endpoint } from './endpoint-fn';
import { EndpointRouter } from './endpoint-router';
import { decorated } from './injections';
import { NestjsEndpoints } from './nestjs-endpoints';

const describedAs = (cls: Type) => descriptorOf(cls)!;

describe('a child router an app loads by itself', () => {
  test('is where its parents place it: their base paths and namespaces above its own', async () => {
    const top = EndpointRouter.create({ rootDirectory: empty, basePath: 'api', namespace: 'api' });
    const middle = top.child({
      rootDirectory: empty,
      basePath: 'api/clinics',
      namespace: 'clinics',
    });
    const bottom = middle.child({
      endpoints: (): Type[] => [List],
      basePath: 'api/clinics/visits',
      namespace: 'visits',
    });
    const List = bottom.endpoint.query({ path: 'list', handler: () => null });
    await bottom;
    expect(pathOf(List)).toBe('/api/clinics/visits/list');
    expect(describedAs(List).namespaceChain).toEqual(['api', 'clinics', 'visits']);
  });

  test('made by the root router of an app, has what the root gives', async () => {
    const root = NestjsEndpoints.forRoot({
      router: {
        rootDirectory: empty,
        basePath: 'api',
        providers: [Access],
        context: {
          inject: { access: Access },
        },
      },
    });
    const child = root.child({ endpoints: (): Type[] => [Granted] });
    const Granted = child.endpoint.query({
      path: 'granted',
      handler() {
        return this.access.granted;
      },
    });
    const app = await start(child);
    expect(pathOf(Granted)).toBe('/api/granted');
    await expect(app.get(Granted, { strict: false }).invoke()).resolves.toBe(true);
    await app.close();
  });

  test('leaves its parent where an app then places it, when that is where it took it to be', async () => {
    const parent = EndpointRouter.create({ endpoints: [], basePath: 'same', namespace: 'same' });
    const child = parent.child({ endpoints: [] });
    await child;
    await expect(parent).resolves.toMatchObject({ controllers: [] });
  });

  test('fails an app that places its parent in another namespace, telling both', async () => {
    const { default: sub } =
      await import('../test/fixtures/routing/moved-namespace/tree/top/sub/router');
    await sub;
    await expect(
      EndpointRouter.create({
        rootDirectory: path.join(fixtures, 'moved-namespace/tree'),
        namespace: 'api',
      }),
    ).rejects.toThrow(
      /top[/\\]router\.ts is under "\/v" in the namespace "api" in this app, and was under "\/v" in the namespace ""/,
    );
  });
});

describe('a router that declares a hook, a property or a method', () => {
  test('has its providers in a module of their own: an endpoint finds them through ModuleRef across the app', async () => {
    const router = EndpointRouter.create({
      endpoints: (): Type[] => [Finds],
      providers: [Access],
      lifecycle: {
        onModuleInit() {},
      },
    });
    const Finds = router.endpoint.query({
      path: `finds-${Math.random()}`,
      inject: { moduleRef: decorated<ModuleRef>(Inject(ModuleRef)) },
      handler() {
        return this.moduleRef;
      },
    });
    const app = await start(router);
    const moduleRef = (await app.get(Finds, { strict: false }).invoke()) as ModuleRef;
    expect(() => moduleRef.get(Access)).toThrow(/Nest could not find Access element/);
    expect(moduleRef.get(Access, { strict: false })).toBeInstanceOf(Access);
    await app.close();
  });

  test('makes a provider it registers for the whole app once', async () => {
    let made = 0;
    const router = EndpointRouter.create({
      endpoints: [],
      providers: [
        {
          provide: APP_GUARD,
          useFactory: () => {
            made++;
            return { canActivate: () => true };
          },
        },
      ],
      properties: () => ({ ready: false }),
      lifecycle: {
        onModuleInit() {
          this.ready = true;
        },
      },
    });
    await (await start(router)).close();
    expect(made).toBe(1);
  });

  test('keeps its hooks when a child is made after it registered', async () => {
    const calls: string[] = [];
    const parent = EndpointRouter.create({
      endpoints: [],
      lifecycle: {
        onModuleInit: () => void calls.push('parent'),
      },
    });
    await parent;
    const child = parent.child({
      endpoints: [],
      lifecycle: {
        onModuleInit: () => void calls.push('child'),
      },
    });
    await (await start(child)).close();
    expect(calls).toEqual(['parent', 'child']);
  });
});

describe('an endpoint whose params name what its URL does not', () => {
  test('fails the router that finds its file', async () => {
    await expect(
      EndpointRouter.create({ rootDirectory: path.join(fixtures, 'own-params') }),
    ).rejects.toThrow(
      /own-params[/\\]visits[/\\]list\.endpoint\.ts: its `params` include `clinicId`, but its URL, \/visits\/list, has no `:clinicId`/,
    );
  });

  test('fails the router that lists it, unless the base path names the parameter', async () => {
    const view = () =>
      endpoint.query({
        path: 'view',
        params: z.object({ clinicId: z.string() }),
        handler: () => null,
      });
    await expect(
      EndpointRouter.create({ basePath: 'clinics', endpoints: [view()] }),
    ).rejects.toThrow('its `params` include `clinicId`, but its URL, /clinics/view');
    await expect(
      EndpointRouter.create({ basePath: 'clinics/:clinicId', endpoints: [view()] }),
    ).resolves.toBeDefined();
  });
});
