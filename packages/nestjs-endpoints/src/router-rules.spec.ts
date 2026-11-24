import {
  type CallHandler,
  type CanActivate,
  Inject,
  Injectable,
  Module,
  type NestInterceptor,
  Req,
  Scope,
  type Type,
  UseGuards,
} from '@nestjs/common';
import { GUARDS_METADATA, INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import { z } from 'zod';
import { empty, pathOf, start } from '../test/routing';
import { endpoint } from './endpoint-fn';
import { EndpointRouter } from './endpoint-router';
import * as publicExports from './index';
import { decorated } from './injections';
import { NestjsEndpoints } from './nestjs-endpoints';
import { settings } from './settings';

/** A path no other test's endpoint has. */
const unique = (name: string) => `${name}-${Math.random()}`;

class Access {
  readonly granted = true;
}

describe('what a router gives the endpoints built with its `endpoint`', () => {
  test("a key a child takes from the request replaces its parent's provider, which no one asks for then", async () => {
    // Nothing provides it: the parent's own endpoints would need it, the child's do not.
    class NotProvided {}
    const parent = EndpointRouter.create({
      endpoints: [],
      context: {
        inject: { tenant: NotProvided },
      },
    });
    const child = parent.child({
      endpoints: (): Type[] => [View],
      context: {
        injectOnRequest: { tenant: decorated<{ url: string }>(Req()) },
      },
    });
    const View = child.endpoint.query({
      path: unique('view'),
      handler: ({ tenant }) => {
        expectTypeOf(tenant).toEqualTypeOf<{ url: string }>();
        return null;
      },
    });
    const app = await start(child);
    expect(app.get(View, { strict: false })).not.toHaveProperty('tenant');
    await app.close();
  });

  test('fails an endpoint whose URL lacks a parameter of a router two levels up', async () => {
    const top = EndpointRouter.create({
      endpoints: [],
      basePath: 'clinics',
      context: {
        params: z.object({ clinicId: z.string() }),
      },
    });
    const bottom = top
      .child({ endpoints: [], basePath: 'clinics/visits' })
      .child({ endpoints: (): Type[] => [List], basePath: 'clinics/visits/notes' });
    const List = bottom.endpoint.query({ path: 'list', handler: () => null });
    await expect(bottom).rejects.toThrow(
      /the `params` of its router include the path parameter `clinicId`, but its URL, \/clinics\/visits\/notes\/list, has no `:clinicId`\. Put the endpoint under a `\$clinicId` folder/,
    );
  });

  test('leaves the params of an endpoint as they are when the router has none: a transform too', async () => {
    const router = EndpointRouter.create({
      endpoints: [],
      context: {
        inject: { access: Access },
      },
    });
    const View = router.endpoint.query({
      path: ':id/view',
      params: z.object({ id: z.string() }).transform(({ id }) => ({ id: Number(id) })),
      handler: ({ params }) => params.id,
    });
    await expect(new View().invoke({ params: { id: '4' } })).resolves.toBe(4);
  });

  test("is given by the app's root router to the endpoints built with its own `endpoint`", async () => {
    const root = NestjsEndpoints.forRoot({
      router: {
        rootDirectory: empty,
        endpoints: (): Type[] => [Granted],
        providers: [Access],
        context: {
          inject: { access: Access },
          params: z.object({ tenant: z.string() }),
        },
      },
    });
    const Granted = root.endpoint.query({
      path: ':tenant/granted',
      handler({ params, access }) {
        expectTypeOf(params).toEqualTypeOf<{ tenant: string }>();
        return [params.tenant, access.granted];
      },
    });
    const app = await start(root);
    await expect(
      app.get(Granted, { strict: false }).invoke({ params: { tenant: 't1' } }),
    ).resolves.toEqual(['t1', true]);
    await app.close();
  });
});

describe('the errors of a router name the call that made it', () => {
  const parent = EndpointRouter.create({ endpoints: [] });
  const made = {
    'EndpointRouter.create()': (options: object) => EndpointRouter.create(options as never),
    'child()': (options: object) => parent.child(options as never),
    'NestjsEndpoints.forRoot()': (options: object) =>
      NestjsEndpoints.forRoot({ router: options as never }),
  };
  const calls = Object.entries(made);
  const here = String.raw`router-rules\.spec\.ts`;

  test.each(calls)('%s: a key in both inject and injectOnRequest', (call, make) => {
    expect(() =>
      make({ context: { inject: { user: Access }, injectOnRequest: { user: decorated(Req()) } } }),
    ).toThrow(
      new RegExp(
        `${call.replace(/[.()]/g, String.raw`\$&`)} in .*${here}: \`user\` is in both \`context\\.inject\` and \`context\\.injectOnRequest\`\\.`,
      ),
    );
  });

  test.each(calls)('%s: a namespace that is not a name', (call, make) => {
    expect(() => make({ namespace: 'a/b' })).toThrow(
      new RegExp(
        `${call.replace(/[.()]/g, String.raw`\$&`)} in .*${here}: \`namespace\`, "a/b", is not a name`,
      ),
    );
  });

  test.each(calls)('%s: a description with no namespace', (call, make) => {
    expect(() => make({ description: 'About' })).toThrow(
      `${call} in ${import.meta.filename}: \`description\` documents a namespace`,
    );
  });

  test.each(calls)('%s: a member named twice', (call, make) => {
    expect(() => make({ methods: { configure() {} } })).toThrow(
      `${call} in ${import.meta.filename}: \`methods\` declares \`configure\`, a name the router has`,
    );
  });

  test.each(calls)('%s: an entry of `endpoints` that is not an endpoint', async (call, make) => {
    class PlainController {}
    await expect(make({ rootDirectory: empty, endpoints: [PlainController] })).rejects.toThrow(
      `${call} in ${import.meta.filename}: \`endpoints\` lists PlainController, which is not an endpoint.`,
    );
    await expect(
      make({ rootDirectory: empty, endpoints: () => [Promise.resolve({ notOne: 1 })] }),
    ).rejects.toThrow(
      `${call} in ${import.meta.filename}: \`endpoints\` lists a module that exports no endpoint.`,
    );
  });

  test.each([
    ['a string', 'list.endpoint', 'list.endpoint'],
    ['a number', 7, '7'],
    ['nothing', undefined, 'undefined'],
  ])('an entry of `endpoints` that is %s is named as it reads', async (_, entry, shown) => {
    await expect(
      EndpointRouter.create({ rootDirectory: empty, endpoints: [entry as never] }),
    ).rejects.toThrow(`\`endpoints\` lists ${shown}, which is not an endpoint.`);
  });

  test('middleware options anywhere but last', () => {
    const fn = () => {};
    expect(() => EndpointRouter.create({ middleware: [{ exclude: ['a'] }, fn] as never })).toThrow(
      'EndpointRouter: middleware options object must be the last entry',
    );
    expect(() => EndpointRouter.create({ middleware: [fn, { exclude: ['a'] }] })).not.toThrow();
  });
});

describe("a router's providers and imports, for the routers under it", () => {
  class Db {
    readonly name = 'db';
  }
  @Module({ providers: [Db], exports: [Db] })
  class DbModule {}
  class Repo {
    constructor(readonly db: Db) {}
  }
  Inject(Db)(Repo, undefined, 0);

  test('a provider of a router with children is made from a module that router imports', async () => {
    const parent = EndpointRouter.create({
      endpoints: [],
      imports: [DbModule],
      providers: [Repo],
    });
    const child = parent.child({
      endpoints: (): Type[] => [Uses],
      context: {
        inject: { repo: Repo },
      },
    });
    const Uses = child.endpoint.query({
      path: unique('uses'),
      handler() {
        return this.repo.db.name;
      },
    });
    const app = await start(NestjsEndpoints.forRoot(), parent, child);
    await expect(app.get(Uses, { strict: false }).invoke()).resolves.toBe('db');
    await app.close();
  });

  test('a provider of a router with a hook, and no router under it, is made from a module it imports', async () => {
    const seen: string[] = [];
    const router = EndpointRouter.create({
      endpoints: [],
      imports: [DbModule],
      providers: [Repo],
      inject: { repo: Repo },
      lifecycle: {
        onModuleInit() {
          seen.push(this.repo.db.name);
        },
      },
    });
    await (await start(router)).close();
    expect(seen).toEqual(['db']);
  });

  test('two children an app loads without their parent share one instance of each of its providers', async () => {
    let made = 0;
    class Counted {
      readonly id = ++made;
    }
    const parent = EndpointRouter.create({ endpoints: [], providers: [Counted] });
    const children = [1, 2].map(() => {
      const child = parent.child({
        endpoints: (): Type[] => [Of],
        context: {
          inject: { counted: Counted },
        },
      });
      const Of = child.endpoint.query({
        path: unique('of'),
        handler() {
          return this.counted.id;
        },
      });
      return { child, Of };
    });
    const app = await start(...children.map(({ child }) => child));
    const ids = await Promise.all(
      children.map(({ Of }) => app.get(Of, { strict: false }).invoke()),
    );
    expect(ids).toEqual([1, 1]);
    expect(made).toBe(1);
    await app.close();
  });

  test("a parent's provider with hooks of its own runs them once in an app that has only a child", async () => {
    const calls: string[] = [];
    class Pool {
      onModuleInit() {
        calls.push('pool init');
      }

      onModuleDestroy() {
        calls.push('pool destroy');
      }
    }
    const parent = EndpointRouter.create({ endpoints: [], providers: [Pool] });
    const child = parent.child({ endpoints: [] });
    await (await start(child)).close();
    expect(calls).toEqual(['pool init', 'pool destroy']);
  });
});

describe("a router's guards and interceptors, given as instances", () => {
  test('are applied as they are, in the order of the lineage', async () => {
    const guard = (name: string): CanActivate & { name: string } => ({
      name,
      canActivate: () => true,
    });
    const interceptor = (name: string): NestInterceptor & { name: string } => ({
      name,
      intercept: (_context: unknown, next: CallHandler) => next.handle(),
    });
    const [outer, inner] = [guard('outer'), guard('inner')];
    const [around, within] = [interceptor('around'), interceptor('within')];
    const parent = EndpointRouter.create({
      endpoints: [],
      guards: [outer],
      interceptors: [around],
    });
    const child = parent.child({
      endpoints: (): Type[] => [Guarded],
      guards: [inner],
      interceptors: [within],
    });
    const Guarded = child.endpoint.query({ path: unique('guarded'), handler: () => null });
    await child;
    expect(Reflect.getMetadata(GUARDS_METADATA, Guarded)).toEqual([outer, inner]);
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, Guarded)).toEqual([around, within]);
  });
});

describe("a router's namespace", () => {
  test('takes a base path without the slashes around it', async () => {
    const router = EndpointRouter.create({
      endpoints: (): Type[] => [List],
      basePath: '/shop/',
      namespace: true,
    });
    const List = router.endpoint.query({ path: 'list', handler: () => null });
    await router;
    const { namespaceChain } = Reflect.getMetadata('endpoints:descriptor', List) as {
      namespaceChain: string[];
    };
    expect(namespaceChain).toEqual(['shop']);
    expect(pathOf(List)).toBe('/shop/list');
  });

  test("fails a child loaded alone whose parent's `namespace: true` has no name, naming the parent", async () => {
    // Created in this file, which is no router file, with no base path: no name to take.
    const parent = EndpointRouter.create({ endpoints: [], namespace: true });
    const child = parent.child({ endpoints: [] });
    await expect(child).rejects.toThrow(
      /router-rules\.spec\.ts: `namespace: true` has no name to take/,
    );
  });

  test('has the description of the last router that describes it', async () => {
    const name = `described${Math.random().toString(36).slice(2)}`;
    const describedAs = () => settings.descriptions.filter((d) => d.name === `${name}/inner`);
    const parent = EndpointRouter.create({ endpoints: [], basePath: name, namespace: name });
    await parent.child({ endpoints: [], namespace: 'inner', description: 'The first' });
    expect(describedAs()).toEqual([{ name: `${name}/inner`, description: 'The first' }]);
    await parent.child({ endpoints: [], namespace: 'inner', description: 'The second' });
    expect(describedAs()).toEqual([{ name: `${name}/inner`, description: 'The second' }]);
  });
});

describe('a lifecycle hook, and what NestJS makes for each request', () => {
  @Injectable({ scope: Scope.REQUEST })
  class PerRequest {}
  @Injectable({ scope: Scope.TRANSIENT })
  class Each {}

  const hookedEndpoint = (options: object = {}) => {
    const router = EndpointRouter.create({
      endpoints: (): Type[] => [Hooked],
      providers: [PerRequest, Each],
      ...options,
    });
    const Hooked = router.endpoint.query({
      path: unique('hooked'),
      lifecycle: {
        onModuleInit() {},
      },
      handler: () => null,
    });
    return router;
  };
  const failure = /declares onModuleInit, but NestJS makes it for each request/;

  test('fails an app whose guard for every endpoint is made for each request', async () => {
    @Injectable({ scope: Scope.REQUEST })
    class EveryRequestGuard implements CanActivate {
      canActivate() {
        return true;
      }
    }
    await expect(
      start(hookedEndpoint({ providers: [{ provide: APP_GUARD, useClass: EveryRequestGuard }] })),
    ).rejects.toThrow(failure);
  });

  test("starts where an interceptor of the endpoint's router depends on a request-scoped provider", async () => {
    class PerRequestInterceptor implements NestInterceptor {
      constructor(readonly perRequest: PerRequest) {}

      intercept(_context: unknown, next: CallHandler) {
        return next.handle();
      }
    }
    Inject(PerRequest)(PerRequestInterceptor, undefined, 0);
    await expect(
      start(hookedEndpoint({ interceptors: [PerRequestInterceptor] })).then((app) => app.close()),
    ).resolves.toBeUndefined();
  });

  test("fails where a guard of the endpoint's own does", async () => {
    class PerRequestGuard implements CanActivate {
      constructor(readonly perRequest: PerRequest) {}

      canActivate() {
        return true;
      }
    }
    Inject(PerRequest)(PerRequestGuard, undefined, 0);
    const router = EndpointRouter.create({
      endpoints: (): Type[] => [Hooked],
      providers: [PerRequest],
    });
    const Hooked = router.endpoint.query({
      path: unique('own-guard'),
      decorators: [UseGuards(PerRequestGuard)],
      lifecycle: {
        onModuleInit() {},
      },
      handler: () => null,
    });
    await expect(start(router)).rejects.toThrow(failure);
  });

  test('fails an endpoint made for each request by what its router injects', async () => {
    const router = EndpointRouter.create({
      endpoints: (): Type[] => [Hooked],
      providers: [PerRequest],
      context: {
        inject: { perRequest: PerRequest },
      },
    });
    const Hooked = router.endpoint.query({
      path: unique('by-router'),
      lifecycle: {
        onModuleInit() {},
      },
      handler: () => null,
    });
    await expect(start(router)).rejects.toThrow(/the endpoint of .* declares onModuleInit/);
  });

  test('fails an endpoint in a module of its own, in an app whose only router is its root', async () => {
    const Hooked = endpoint.query({
      path: unique('plain-module'),
      inject: { perRequest: PerRequest },
      lifecycle: {
        onModuleInit() {},
      },
      handler: () => null,
    });
    @Module({ controllers: [Hooked], providers: [PerRequest] })
    class OwnModule {}
    await expect(start(EndpointRouter.create({ endpoints: [] }), OwnModule)).rejects.toThrow(
      failure,
    );
  });

  test('names every hook the endpoint declares', async () => {
    const router = EndpointRouter.create({
      endpoints: (): Type[] => [Hooked],
      providers: [PerRequest],
    });
    const Hooked = router.endpoint.query({
      path: unique('three'),
      inject: { perRequest: PerRequest },
      lifecycle: {
        onModuleInit() {},
        onApplicationBootstrap() {},
        onModuleDestroy() {},
      },
      handler: () => null,
    });
    await expect(start(router)).rejects.toThrow(
      'declares onModuleInit, onApplicationBootstrap, and onModuleDestroy, but NestJS makes it',
    );
  });

  test('starts an endpoint and a router that inject a transient provider, and calls their hooks', async () => {
    const calls: string[] = [];
    const router = EndpointRouter.create({
      endpoints: (): Type[] => [Hooked],
      providers: [Each],
      // Into itself, and into its endpoints.
      inject: { each: Each },
      context: { inject: { each: Each } },
      lifecycle: {
        onModuleInit() {
          calls.push(`router ${this.each instanceof Each}`);
        },
      },
    });
    const Hooked = router.endpoint.query({
      path: unique('transient'),
      lifecycle: {
        onModuleInit() {
          calls.push(`endpoint ${this.each instanceof Each}`);
        },
      },
      handler: () => null,
    });
    await (await start(router)).close();
    expect(calls).toEqual(['router true', 'endpoint true']);
  });

  test('starts a router with a hook whose guard is made for each request, when its endpoints declare none', async () => {
    class PerRequestGuard implements CanActivate {
      constructor(readonly perRequest: PerRequest) {}

      canActivate() {
        return true;
      }
    }
    Inject(PerRequest)(PerRequestGuard, undefined, 0);
    const calls: string[] = [];
    const router = EndpointRouter.create({
      endpoints: (): Type[] => [Plain],
      providers: [PerRequest],
      guards: [PerRequestGuard],
      lifecycle: {
        onModuleInit: () => void calls.push('router'),
      },
    });
    const Plain = router.endpoint.query({ path: unique('plain'), handler: () => null });
    await (await start(router)).close();
    expect(calls).toEqual(['router']);
  });
});

describe("a router's lifecycle hooks, in an app", () => {
  test('a router under another starts once the one above it has finished starting', async () => {
    const calls: string[] = [];
    const parent = EndpointRouter.create({
      endpoints: [],
      lifecycle: {
        async onModuleInit() {
          calls.push('parent starts');
          await new Promise((resolve) => setTimeout(resolve, 20));
          calls.push('parent started');
        },
      },
    });
    const child = parent.child({
      endpoints: (): Type[] => [Listed],
      lifecycle: {
        onModuleInit: () => void calls.push('child starts'),
      },
    });
    const Listed = child.endpoint.query({
      path: unique('listed'),
      lifecycle: {
        onModuleInit: () => void calls.push('endpoint starts'),
      },
      handler: () => null,
    });
    await (await start(child)).close();
    expect(calls).toEqual(['parent starts', 'parent started', 'child starts', 'endpoint starts']);
  });

  test('are given the signal the app shuts down on', async () => {
    const signals: unknown[] = [];
    const router = EndpointRouter.create({
      endpoints: [],
      lifecycle: {
        beforeApplicationShutdown: (signal) => void signals.push(signal),
        onApplicationShutdown: (signal) => void signals.push(signal),
      },
    });
    const app = await start(router);
    // NestJS passes on the signal it shuts down on; its types have `close()` take none.
    await (app as unknown as { close(signal: string): Promise<void> }).close('SIGTERM');
    expect(signals).toEqual(['SIGTERM', 'SIGTERM']);
  });

  test('have what the router injects into itself by a token, through decorated()', async () => {
    const seen: unknown[] = [];
    const router = EndpointRouter.create({
      endpoints: [],
      providers: [{ provide: 'CONFIG', useValue: { region: 'eu' } }],
      inject: { config: decorated<{ region: string }>(Inject('CONFIG')) },
      lifecycle: {
        onModuleInit() {
          expectTypeOf(this.config).toEqualTypeOf<{ region: string }>();
          seen.push(this.config.region);
        },
      },
    });
    await (await start(router)).close();
    expect(seen).toEqual(['eu']);
  });

  test('give the function that makes its properties no `this`, and its getters the instance', async () => {
    const seen: unknown[] = [];
    const router = EndpointRouter.create({
      endpoints: [],
      methods: {
        label() {
          return `router ${this.count}`;
        },
      },
      properties() {
        seen.push(this);
        // @ts-expect-error the function makes the properties: it has no instance
        const check = () => this.count;
        void check;
        return {
          count: 1,
          get name() {
            return this.label();
          },
          set name(value: string) {
            this.count = value.length;
          },
        };
      },
      lifecycle: {
        onModuleInit() {
          seen.push(this.name);
          this.name = 'four';
          seen.push(this.name);
        },
      },
    });
    await (await start(router)).close();
    expect(seen).toEqual([undefined, 'router 1', 'router 4']);
  });

  test('fail the app as it starts when its properties are not an object, or name a member twice', async () => {
    const router = (properties: () => unknown) =>
      EndpointRouter.create({ endpoints: [], properties: properties as never });
    await expect(start(router(() => null))).rejects.toThrow(
      /EndpointRouter\.create\(\) in .*: `properties` must return an object\./,
    );
    await expect(start(router(() => ({ configure: 1 })))).rejects.toThrow(
      '`properties` declares `configure`, a name the router has',
    );
    await expect(start(router(() => ({ onModuleInit: 1 })))).rejects.toThrow(
      '`properties` declares `onModuleInit`, a lifecycle hook',
    );
  });
});

describe('routers made with child(), in an app without the routers above them', () => {
  test('two of one parent start with no root: neither is a router of the app in its own right', async () => {
    const parent = EndpointRouter.create({ endpoints: [] });
    const app = await start(parent.child({ endpoints: [] }), parent.child({ endpoints: [] }));
    await app.close();
    // Where two routers made with create() ask for one.
    await expect(
      start(EndpointRouter.create({ endpoints: [] }), EndpointRouter.create({ endpoints: [] })),
    ).rejects.toThrow('this app has 2 routers and no root');
  });

  test('a child of a root that has no router of its own is a router as any other', async () => {
    const root = NestjsEndpoints.forRoot();
    const child = root.child({
      endpoints: (): Type[] => [Granted],
      basePath: 'kids',
      providers: [Access],
      context: {
        inject: { access: Access },
      },
    });
    const Granted = child.endpoint.query({
      path: 'granted',
      handler() {
        return this.access.granted;
      },
    });
    // By itself, and beside the root.
    const alone = await start(child);
    expect(pathOf(Granted)).toBe('/kids/granted');
    await expect(alone.get(Granted, { strict: false }).invoke()).resolves.toBe(true);
    await alone.close();
    const whole = await start(root, child);
    await expect(whole.get(Granted, { strict: false }).invoke()).resolves.toBe(true);
    await whole.close();
  });
});

describe('what the package exports', () => {
  test('has the router under its name, and none of the names it had', () => {
    expect(publicExports).toHaveProperty('EndpointRouter');
    expect(typeof publicExports.EndpointRouter.create).toBe('function');
    expect(publicExports).not.toHaveProperty('EndpointRouterModule');
    expect(publicExports).not.toHaveProperty('EndpointsRouterModule');
    expect(publicExports.EndpointRouter).not.toHaveProperty('register');
  });
});
