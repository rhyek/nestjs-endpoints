import path from 'node:path';
import {
  CanActivate,
  DynamicModule,
  Inject,
  Injectable,
  Module,
  Req,
  Scope,
  Type,
} from '@nestjs/common';
import {
  APP_GUARD,
  ApplicationConfig,
  type ContextId,
  ContextIdFactory,
  ModuleRef,
  REQUEST,
} from '@nestjs/core';
import { z } from 'zod';
import { Access } from '../test/fixtures/routing/context/access';
import { Clock, ClockModule } from '../test/fixtures/routing/context/clock';
import { empty, fixtures, nestedIn, pathsOf, start } from '../test/routing';
import { DESCRIPTOR_METADATA_KEY } from './descriptors';
import { endpoint } from './endpoint-fn';
import { EndpointRouter, EndpointRouterOptions } from './endpoint-router';
import { moduleAls } from './helpers';
import { decorated } from './injections';
import { NestjsEndpoints, type NestjsEndpointsOptions } from './nestjs-endpoints';

/** Starts an app made of `router`: the instance it made of each endpoint under it, by path. */
async function endpointsOf(router: Promise<DynamicModule>) {
  const module = await router;
  const app = await start(module);
  const all = (module as unknown as { [key: symbol]: Type[] })[
    Symbol.for('nestjs-endpoints:allEndpoints')
  ];
  const instances = Object.fromEntries(
    all.map((cls) => [
      Reflect.getMetadata('endpoints:path', cls) as string,
      app.get<Record<string, any>>(cls, { strict: false }),
    ]),
  );
  await app.close();
  return instances;
}

describe('a router finds its endpoint files where the app runs', () => {
  test('serves the endpoint files in its root directory, and those of a nested router', async () => {
    const module = await EndpointRouter.create({
      rootDirectory: path.join(fixtures, 'basic'),
    });
    expect(pathsOf(module)).toEqual(['a', 'b']);
    const [shop] = nestedIn(module);
    expect(pathsOf(shop)).toEqual(['shop/c']);
  });

  test('with no root directory, scans the folder of the file that created it', async () => {
    // `siblings/blog/router.module.ts` names none, and finds the endpoint file beside it.
    const { default: blog } = await import('../test/fixtures/routing/siblings/blog/router.module');
    expect(pathsOf(await blog)).toEqual(['blog/list']);
  });

  test.each([
    ['is not there', '/nowhere'],
    ['has no endpoint files', path.join(fixtures, 'empty')],
  ])('serves nothing from a root directory that %s', async (_, rootDirectory) => {
    const module = await EndpointRouter.create({ rootDirectory });
    expect(module.controllers).toEqual([]);
  });

  test('takes the TypeScript file where a compiled twin sits beside it', async () => {
    const module = await EndpointRouter.create({
      rootDirectory: path.join(fixtures, 'twins'),
    });
    expect(pathsOf(module)).toEqual(['a']);
  });

  test('fails with the error of an endpoint file that throws while it loads', async () => {
    const failure = await EndpointRouter.create({
      rootDirectory: path.join(fixtures, 'throws'),
    }).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    expect(failure?.message).toBe('boom in bad.endpoint');
    // The error is the file's own, so its stack says where it was thrown.
    expect(failure?.stack).toContain(path.join('throws', 'bad.endpoint.ts'));
  });
});

describe('a router in a file named router.ts', () => {
  const named = async () =>
    (await import('../test/fixtures/routing/named/router')).default as Promise<DynamicModule>;

  test('has the base path and the namespace of its folder, as one in a router.module.ts', async () => {
    const module = await named();
    expect(pathsOf(module)).toEqual(['named/list']);
    const descriptor = Reflect.getMetadata(DESCRIPTOR_METADATA_KEY, module.controllers![0]!) as {
      namespaceChain: string[];
    };
    expect(descriptor.namespaceChain).toEqual(['named']);
  });

  test('is found by the router of a folder above it', async () => {
    const [inner] = nestedIn(await named());
    expect(pathsOf(inner)).toEqual(['named/inner/view']);
  });

  test('is taken over a router.module.ts beside it, which is not loaded', async () => {
    // `prefer/pair/router.module.ts` throws if it is loaded.
    const module = await EndpointRouter.create({ rootDirectory: path.join(fixtures, 'prefer') });
    expect(nestedIn(module).map((nested) => pathsOf(nested))).toEqual([['fallback/view'], []]);
    // `prefer/fallback/router.ts` is no router, so its router.module.ts is the folder's;
    // `prefer/function/router.ts` default-exports a function, so its folder is the router's above.
    expect(pathsOf(module)).toEqual(['function/list']);
  });

  test('of a folder with two other router files that are both routers fails', async () => {
    await expect(
      EndpointRouter.create({ rootDirectory: path.join(fixtures, 'twofold') }),
    ).rejects.toThrow(
      /twofold[/\\]two has both a\.router\.module\.ts and b\.router\.module\.ts\. A folder has one router file/,
    );
  });

  test('that throws as it loads fails with its error, naming the router that loaded it', async () => {
    const failure = await EndpointRouter.create({
      rootDirectory: path.join(fixtures, 'broken-router'),
    }).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    expect(failure?.message).toMatch(
      /endpoint-router\.spec\.ts loaded .*broken[/\\]router\.ts, which has the name of a router file, to see whether it is one, and it threw: boom in broken\/router/,
    );
    // The file's own error, as its cause.
    expect((failure?.cause as Error | undefined)?.message).toBe('boom in broken/router');
  });

  test('is left to the module that imports it when it exports its router by name', async () => {
    const module = await EndpointRouter.create({ rootDirectory: path.join(fixtures, 'by-hand') });
    // Its folder is its own: the router above neither registers it nor looks inside.
    expect(nestedIn(module)).toEqual([]);
    expect(module.controllers).toEqual([]);
  });

  test('is one only when it exports a router: any other file of that name is an ordinary file', async () => {
    // `stranger/trpc/router.ts` default-exports an object of another library.
    const module = await EndpointRouter.create({ rootDirectory: path.join(fixtures, 'stranger') });
    expect(nestedIn(module)).toEqual([]);
    // Its folder is the router's above, as any folder is.
    expect(pathsOf(module)).toEqual(['trpc/list']);
    // Nor is the module that `stranger/feature/router.module.ts` default-exports imported.
    expect(module.imports).toEqual([]);
  });
});

test('a router imports the endpoints a callback lists when it runs', async () => {
  const ping = endpoint.query({ path: 'ping', handler: () => 'pong' });
  const pong = endpoint.query({ path: 'pong', handler: () => 'ping' });
  const pung = endpoint.query({ path: 'pung', handler: () => 'pang' });
  const pang = endpoint.query({ path: 'pang', handler: () => 'pung' });
  let called = false;
  const router = EndpointRouter.create({
    basePath: 'listed',
    endpoints: () => {
      called = true;
      // A class, a promise of one, and modules as `import()` resolves to
      // them: one whose default export is an endpoint, one with a named
      // endpoint export beside something that isn't one.
      return [
        ping,
        Promise.resolve(pong),
        Promise.resolve({ default: pung }),
        Promise.resolve({ pang, pangInput: {} }),
      ];
    },
  });
  expect(called).toBe(false);
  const module = await router;
  expect(module.controllers).toEqual([ping, pong, pung, pang]);
  expect(Reflect.getMetadata('endpoints:path', pung)).toBe('/listed/pung');
});

test('a router serves the endpoint files that default-export an endpoint, and no other', async () => {
  const module = await EndpointRouter.create({
    rootDirectory: path.join(fixtures, 'not-endpoints'),
  });
  expect(pathsOf(module)).toEqual(['real']);
});

test('a router refuses a listed entry that is not an endpoint', async () => {
  class PlainController {}
  await expect(EndpointRouter.create({ endpoints: [PlainController] })).rejects.toThrow(
    /EndpointRouter\.create\(\) in [\s\S]*`endpoints` lists PlainController, which is not an endpoint/,
  );
  await expect(EndpointRouter.create({ endpoints: () => [PlainController] })).rejects.toThrow(
    /`endpoints` lists PlainController, which is not an endpoint/,
  );
});

test('a router fails when a module its callback lists exports no endpoint', async () => {
  await expect(
    EndpointRouter.create({
      endpoints: () => [Promise.resolve({ pangInput: {} })],
    }),
  ).rejects.toThrow(/endpoint-router\.spec[\s\S]*exports no endpoint/);
});

test('a top-level router stays top-level when another router awaits it first', async () => {
  const ping = endpoint.query({ path: 'ping', handler: () => 'pong' });
  const router = EndpointRouter.create({ endpoints: [ping] });
  // What a parent router does when a file it discovered default-exports a
  // router that was already created outside any router.
  await moduleAls.run(
    {
      parentRouterFile: '/elsewhere/router.module.ts',
      parentBasePath: 'api',
      parentModuleDir: '/elsewhere',
      parentRootDirectories: [],
      parentNamespaceChain: ['api'],
    },
    // Returned from an async function, as the parent's loader does, so it
    // is adopted — its `then` called — inside the parent's context.
    async () => router,
  );
  expect(Reflect.getMetadata('endpoints:path', ping)).toBe('/ping');
});

describe("a router's injections", () => {
  class Service {}

  test('may not declare a key in both inject and injectOnRequest', () => {
    expect(() =>
      EndpointRouter.create({
        endpoints: [],
        context: {
          inject: { user: Service },
          // @ts-expect-error `user` is in both inject and injectOnRequest
          injectOnRequest: { user: decorated<string>(Req()) },
        },
      }),
    ).toThrow(
      /EndpointRouter\.create\(\) in [\s\S]*endpoint-router\.spec[\s\S]*`user` is in both `context\.inject` and `context\.injectOnRequest`/,
    );
  });

  test('types its endpoints from either map, or both', () => {
    expectTypeOf(EndpointRouter.create({ endpoints: [] })).toEqualTypeOf<EndpointRouter>();
    expectTypeOf(
      EndpointRouter.create({
        endpoints: [],
        context: {
          inject: { service: Service },
        },
      }),
    ).toEqualTypeOf<EndpointRouter<{ service: typeof Service }>>();
    expectTypeOf(
      EndpointRouter.create({
        endpoints: [],
        context: {
          injectOnRequest: { user: decorated<string>(Req()) },
        },
      }),
    ).toEqualTypeOf<EndpointRouter<undefined, { user: ReturnType<typeof decorated<string>> }>>();
    EndpointRouter.create({
      endpoints: [],
      context: {
        inject: { service: Service },
        injectOnRequest: { user: decorated<string>(Req()) },
      },
    }).endpoint.query({
      path: 'types-only',
      handler: (params) => {
        expectTypeOf(params.service).toEqualTypeOf<Service>();
        expectTypeOf(params.user).toEqualTypeOf<string>();
        return null;
      },
    });
  });
});

describe("a router's params", () => {
  test('must be a plain object schema', () => {
    expect(() =>
      EndpointRouter.create({
        endpoints: [],
        context: {
          // @ts-expect-error a transformed object is not a plain one
          params: z.object({ id: z.string() }).transform((x) => x),
        },
      }),
    ).toThrow(
      /EndpointRouter\.create\(\) in [\s\S]*endpoint-router\.spec[\s\S]*`context\.params` must be a plain z\.object\(\)/,
    );
  });

  test('are refused in the name of the call that made the router', () => {
    const transformed = z.object({ id: z.string() }).transform((x) => x) as never;
    expect(() =>
      EndpointRouter.create({ endpoints: [] }).child({
        endpoints: [],
        context: {
          params: transformed,
        },
      }),
    ).toThrow(/^child\(\) in /);
    expect(() =>
      NestjsEndpoints.forRoot({
        router: {
          endpoints: [],
          context: {
            params: transformed,
          },
        },
      }),
    ).toThrow(/^NestjsEndpoints\.forRoot\(\) in /);
  });

  test('type the router, and the handlers of its endpoints', () => {
    const params = z.object({ id: z.coerce.number() });
    const router = EndpointRouter.create({
      endpoints: [],
      context: {
        params,
      },
    });
    expectTypeOf(router).toEqualTypeOf<EndpointRouter<undefined, undefined, typeof params>>();
    router.endpoint.query({
      path: ':id/types-only',
      handler: ({ params, schemas }) => {
        expectTypeOf(params).toEqualTypeOf<{ id: number }>();
        expectTypeOf(schemas.params.shape.id).toEqualTypeOf<z.ZodCoercedNumber>();
        return null;
      },
    });
  });
});

describe("a router's namespace", () => {
  const namespaceOf = async (options: EndpointRouterOptions<undefined, undefined, undefined>) => {
    const cls = endpoint.query({ path: `ns-${Math.random()}`, handler: () => null });
    await EndpointRouter.create({ rootDirectory: empty, endpoints: [cls], ...options });
    return (Reflect.getMetadata(DESCRIPTOR_METADATA_KEY, cls) as { namespaceChain: string[] })
      .namespaceChain;
  };

  test.each(['shop', 'check-out', 'check_out', 'v2', 'Admin'])('may be named %s', async (name) => {
    await expect(namespaceOf({ namespace: name })).resolves.toEqual([name]);
    await expect(namespaceOf({ basePath: name, namespace: true })).resolves.toEqual([name]);
  });

  test.each(['a/b', ':id', '2fa', 'a.b', 'a b', '-a', ''])(
    'may not be named "%s", as a string',
    (name) => {
      expect(() => EndpointRouter.create({ endpoints: [], namespace: name })).toThrow(
        /^EndpointRouter\.create\(\) in [\s\S]*is not a name for a namespace/,
      );
    },
  );

  test('may not be a base path that is not a name', async () => {
    await expect(namespaceOf({ basePath: 'clinics/:clinicId', namespace: true })).rejects.toThrow(
      /endpoint-router\.spec[\s\S]*"clinics\/:clinicId", is not a name for a namespace[\s\S]*Give `namespace` a string/,
    );
  });

  test('set to true, needs a base path or a folder to take its name from', async () => {
    // Created outside a router file, with no base path.
    await expect(namespaceOf({ namespace: true })).rejects.toThrow(
      /endpoint-router\.spec[\s\S]*`namespace: true` has no name to take/,
    );
    // In a router file of a folder that names a path parameter.
    const { default: unnamed } = await import('../test/fixtures/routing/unnamed/router.module');
    await expect(unnamed).rejects.toThrow(
      /unnamed[/\\]\$id[/\\]router\.module[\s\S]*`namespace: true` has no name to take/,
    );
  });

  test('is what a description documents: a router with none takes no description', () => {
    expect(() =>
      // @ts-expect-error a description needs a namespace on the same router
      EndpointRouter.create({ endpoints: [], description: 'Orders' }),
    ).toThrow(/^EndpointRouter\.create\(\) in [\s\S]*`description` documents a namespace/);
    const off = false as boolean;
    expect(() =>
      EndpointRouter.create().child({ endpoints: [], namespace: off, description: 'Orders' }),
    ).toThrow(/^child\(\) in [\s\S]*`description` documents a namespace/);
    expect(() =>
      EndpointRouter.create({ endpoints: [], namespace: 'orders', description: 'Orders' }),
    ).not.toThrow();
  });
});

describe('a child router', () => {
  class A {}
  class B {}

  test("gives its endpoints its parent's context under its own", async () => {
    const parent = EndpointRouter.create({
      endpoints: [],
      context: {
        inject: { a: A, b: B },
        params: z.object({ x: z.string() }),
      },
    });
    const child = parent.child({
      endpoints: [],
      context: {
        injectOnRequest: { a: decorated<string>(Req()) },
        params: z.object({ y: z.coerce.number() }),
      },
    });
    const cls = child.endpoint.query({
      path: ':x/:y/child',
      handler: ({ params, a, b }) => {
        expectTypeOf(params).toEqualTypeOf<{ x: string; y: number }>();
        expectTypeOf(a).toEqualTypeOf<string>();
        expectTypeOf(b).toEqualTypeOf<B>();
        return { params, b };
      },
    });
    const b = new B();
    // `a` is the child's, on request: Nest sets only `b` on the instance.
    await expect(
      Object.assign(new cls(), { b }).invoke({ params: { x: 'p', y: '2' } }),
    ).resolves.toEqual({ params: { x: 'p', y: 2 }, b });
  });

  test('accrues through every level, the nearest declaration winning', async () => {
    const grandchild = EndpointRouter.create({
      endpoints: [],
      context: {
        inject: { a: A },
        params: z.object({ x: z.string(), y: z.string() }),
      },
    })
      .child({
        endpoints: [],
        context: {
          inject: { b: B },
          params: z.object({ y: z.coerce.number() }),
        },
      })
      .child({
        endpoints: [],
        context: {
          inject: { a: B },
          params: z.object({ z: z.coerce.boolean() }),
        },
      });
    const cls = grandchild.endpoint.query({
      path: ':x/:y/:z/grandchild',
      handler: ({ params, a, b }) => {
        expectTypeOf(params).toEqualTypeOf<{ x: string; y: number; z: boolean }>();
        expectTypeOf(a).toEqualTypeOf<B>();
        expectTypeOf(b).toEqualTypeOf<B>();
        return params;
      },
    });
    await expect(new cls().invoke({ params: { x: 'p', y: '2', z: '1' } })).resolves.toEqual({
      x: 'p',
      y: 2,
      z: true,
    });
  });

  test("with nothing of its own has its parent's context", () => {
    const parent = EndpointRouter.create({
      endpoints: [],
      context: {
        inject: { a: A },
      },
    });
    expectTypeOf(parent.child()).toEqualTypeOf(parent);
    expectTypeOf(EndpointRouter.create().child()).toEqualTypeOf<EndpointRouter>();
  });

  test('is found by its parent, at the URL of its own folder', async () => {
    const { default: clinics } =
      await import('../test/fixtures/routing/context/clinics/router.module');
    const module = await clinics;
    expect(pathsOf(module)).toEqual(['clinics/list']);
    const [child] = nestedIn(module);
    expect(pathsOf(child)).toEqual(['clinics/:clinicId/view']);
  });

  test('fails when it is nested under a router other than its parent', async () => {
    const { default: stray } = await import('../test/fixtures/routing/context/stray/router.module');
    await expect(stray).rejects.toThrow(
      /stray[/\\]lost[/\\]router\.module[\s\S]*clinics[/\\]router\.module[\s\S]*stray[/\\]router\.module/,
    );
  });

  test("loads without its parent, its endpoints with the parent's context and under its base path", async () => {
    const { default: child } =
      await import('../test/fixtures/routing/context/solo/$id/router.module');
    const [view] = (await child).controllers as [new () => { invoke: (o: object) => unknown }];
    expect(Reflect.getMetadata('endpoints:path', view)).toBe('solo/:id/view');
    const access = { granted: 'yes' };
    await expect(
      Object.assign(new view(), { access }).invoke({ params: { id: '4' } }),
    ).resolves.toEqual({ id: 4, granted: 'yes' });
  });
});

test('a router that an app places elsewhere than a child loaded before it took it to be, fails the app', async () => {
  const { default: sub } = await import('../test/fixtures/routing/moved/tree/top/sub/router');
  // By itself, the child is under its parent, and its parent where its folder says.
  expect(pathsOf(await sub)).toEqual(['top/sub/view']);
  // The app has a router above them, which gives the parent another place.
  await expect(
    EndpointRouter.create({ rootDirectory: path.join(fixtures, 'moved/tree'), basePath: 'api' }),
  ).rejects.toThrow(
    /moved[/\\]tree[/\\]top[/\\]router\.ts is under "\/api\/top" in this app, and was under "\/top" for a router made with its child\(\) that was loaded before/,
  );
});

test("a child's child loads without the routers above it, with the URL it has under them", async () => {
  const { default: items } =
    await import('../test/fixtures/routing/context/deep/$id/items/router.module');
  const [list] = (await items).controllers as [new () => { invoke: (o: object) => unknown }];
  // Its base path comes from its parents', whether or not an app has them.
  expect(Reflect.getMetadata('endpoints:path', list)).toBe('deep/:id/items/list');
  await expect(
    Object.assign(new list(), { access: { granted: true } }).invoke({ params: { id: '4' } }),
  ).resolves.toEqual({ id: 4, granted: true });
});

describe("a router's providers and imports", () => {
  test('are those of the routers made with its child(), as the same instances', async () => {
    const { default: shared } =
      await import('../test/fixtures/routing/context/shared/router.module');
    const at = await endpointsOf(shared);
    expect(at['shared/list'].access).toBeInstanceOf(Access);
    // A provider of the child is made from what its parent provides and imports.
    expect(at['shared/:id/view'].visits.access).toBe(at['shared/list'].access);
    expect(at['shared/:id/view'].visits.clock).toBeInstanceOf(Clock);
  });

  test('give way to a provider a child lists itself: its own instance, and that of the routers under it', async () => {
    const { default: shared } =
      await import('../test/fixtures/routing/context/shared/router.module');
    const at = await endpointsOf(shared);
    expect(at['shared/:id/own/list'].access).toBeInstanceOf(Access);
    expect(at['shared/:id/own/list'].access).not.toBe(at['shared/list'].access);
    expect(at['shared/:id/own/deeper/list'].access).toBe(at['shared/:id/own/list'].access);
  });

  test('come with a child that an app loads without its parent', async () => {
    const { default: child } =
      await import('../test/fixtures/routing/context/solo/$id/router.module');
    const at = await endpointsOf(child);
    expect(at['solo/:id/view'].access).toBeInstanceOf(Access);
    expect(at['solo/:id/view'].clock).toBeInstanceOf(Clock);
  });

  test("come with a child's child that an app loads without the routers above it", async () => {
    const { default: items } =
      await import('../test/fixtures/routing/context/deep/$id/items/router.module');
    expect((await endpointsOf(items))['deep/:id/items/list'].access).toBeInstanceOf(Access);
  });

  test('come with a child loaded alone though a router above it imports another router', async () => {
    // The child is no router of the app's own: the imported one is its only one.
    const imported = EndpointRouter.create({ endpoints: [], basePath: 'imported' });
    const parent = EndpointRouter.create({
      endpoints: [],
      imports: [imported],
      providers: [Access],
    });
    const child = parent.child({ endpoints: (): Type[] => [Granted] });
    const Granted = child.endpoint.query({
      path: `granted-${Math.random()}`,
      inject: { access: Access },
      handler() {
        return this.access.granted;
      },
    });
    const app = await start(child);
    await expect(app.get(Granted, { strict: false }).invoke()).resolves.toBe(true);
    await app.close();
  });

  test('include a module a child imports again, which is the same module', async () => {
    const { default: shared } =
      await import('../test/fixtures/routing/context/shared/router.module');
    const at = await endpointsOf(shared);
    expect(at['shared/:id/own/list'].clock).toBe(at['shared/:id/view'].visits.clock);
  });

  test('are found by a ModuleRef an endpoint of the router injects', async () => {
    const cls = endpoint.query({
      path: 'module-ref',
      inject: { moduleRef: decorated<ModuleRef>(Inject(ModuleRef)) },
      handler: () => null,
    });
    const at = await endpointsOf(
      EndpointRouter.create({ rootDirectory: empty, endpoints: [cls], providers: [Access] }),
    );
    const [{ moduleRef }] = Object.values(at) as [{ moduleRef: ModuleRef }];
    expect(moduleRef.get(Access)).toBeInstanceOf(Access);
  });

  test('are not exported: a router has no `exports`, however it is made', () => {
    // Options in a variable pass the compiler with a key the type lacks: the call refuses it.
    const options = { endpoints: [], exports: [Access] };
    expect(() => NestjsEndpoints.forRoot({ router: options })).toThrow(
      /^NestjsEndpoints\.forRoot\(\) in [\s\S]*`exports` is not a router option/,
    );
    expect(() => EndpointRouter.create().child(options)).toThrow(
      /^child\(\) in [\s\S]*`exports` is not a router option/,
    );
    // A key that is there and unset, as spreading a module's metadata leaves it, is no export.
    const unset = { endpoints: [], exports: undefined };
    expect(() => EndpointRouter.create(unset)).not.toThrow();
    expect(() =>
      EndpointRouter.create({
        endpoints: [],
        // @ts-expect-error not a router option
        exports: [Access],
      }),
    ).toThrow(
      /EndpointRouter\.create\(\) in [\s\S]*endpoint-router\.spec[\s\S]*`exports` is not a router option/,
    );
  });

  test('stay inside the router and the routers under it', async () => {
    const router = EndpointRouter.create({ rootDirectory: empty, providers: [Access] });
    class Outside {}
    Module({
      imports: [router],
      providers: [{ provide: 'outside', useFactory: (access: Access) => access, inject: [Access] }],
    })(Outside);
    await expect(start(Outside)).rejects.toThrow(/Nest can't resolve dependencies of the outside/);
  });

  test('take a provider for the whole app, and an import that is a promise', async () => {
    const guard = { canActivate: () => true };
    const router = EndpointRouter.create({
      rootDirectory: empty,
      imports: [Promise.resolve({ module: ClockModule })],
      providers: [Access, { provide: APP_GUARD, useValue: guard }],
    });
    const child = router.child({
      rootDirectory: empty,
      providers: [{ provide: 'clock', useExisting: Clock }],
    });
    const app = await start(child);
    expect(app.get('clock', { strict: false })).toBeInstanceOf(Clock);
    await app.close();
  });
});

describe('a router with child routers', () => {
  // Its providers are in a module of their own, which its children import.
  const withChild = (options: EndpointRouterOptions<undefined, undefined, undefined>) => {
    const router = EndpointRouter.create({ rootDirectory: empty, ...options });
    void router.child({ rootDirectory: empty });
    return router;
  };

  test('starts when it imports the router it is nested under', async () => {
    const { default: cycle } = await import('../test/fixtures/routing/context/cycle/router.module');
    const started = start(cycle).then(async (app) => {
      const found = app.get<unknown>('inner', { strict: false });
      await app.close();
      return found;
    });
    const hung = new Promise((resolve) => setTimeout(resolve, 2000, 'hung'));
    await expect(Promise.race([started, hung])).resolves.toBe(true);
  });

  test('has what it lists before what its parent does: a provider, then an import', async () => {
    const who = (value: string) => ({ provide: 'who', useValue: value });
    const exporting = (value: string) => {
      class Exporting {}
      Module({ providers: [who(value)], exports: ['who'] })(Exporting);
      return Exporting;
    };
    const seen = { provide: 'seen', useFactory: (value: string) => value, inject: ['who'] };
    const top = EndpointRouter.create({
      rootDirectory: empty,
      imports: [exporting("top's import")],
      providers: [who('top')],
    });
    const byImport = top.child({ rootDirectory: empty, imports: [exporting("child's import")] });
    const under = byImport.child({ rootDirectory: empty, providers: [seen] });
    const byProvider = top.child({ rootDirectory: empty, providers: [who('child'), seen] });
    const plain = top.child({ rootDirectory: empty, providers: [seen] });
    for (const [router, expected] of [
      [under, "child's import"],
      [byProvider, 'child'],
      [plain, 'top'],
    ] as const) {
      const app = await start(router);
      expect(app.get('seen', { strict: false })).toBe(expected);
      await app.close();
    }
  });

  test('makes each provider once, and registers one for the whole app once', async () => {
    let made = 0;
    class Counted {
      constructor() {
        made++;
      }
    }
    const guard = { canActivate: () => true };
    const router = EndpointRouter.create({
      rootDirectory: empty,
      providers: [Counted, { provide: APP_GUARD, useValue: guard }],
    });
    const child = router.child({
      rootDirectory: empty,
      providers: [{ provide: 'uses', useExisting: Counted }],
    });
    const app = await start(NestjsEndpoints.forRoot(), router, child);
    expect(made).toBe(1);
    expect(app.get(ApplicationConfig, { strict: false }).getGlobalGuards()).toEqual([guard]);
    await app.close();
  });

  test('is not one because of a child() call that fails', async () => {
    const router = EndpointRouter.create({ rootDirectory: empty, providers: [Access] });
    const transformed = z.object({ id: z.string() }).transform((x) => x) as never;
    expect(() =>
      router.child({
        context: {
          params: transformed,
        },
      }),
    ).toThrow(/`context\.params` must be a plain/);
    expect((await router).providers).toContain(Access);
  });

  test('keeps its providers to itself and the routers under it', async () => {
    const router = withChild({ providers: [Access] });
    class Outside {}
    Module({
      imports: [router],
      providers: [{ provide: 'outside', useFactory: (access: Access) => access, inject: [Access] }],
    })(Outside);
    await expect(start(Outside)).rejects.toThrow(/Nest can't resolve dependencies of the outside/);
  });

  test("has its providers found by an endpoint's ModuleRef that is not strict", async () => {
    const cls = endpoint.query({
      path: 'module-ref-of-parent',
      inject: { moduleRef: decorated<ModuleRef>(Inject(ModuleRef)) },
      handler: () => null,
    });
    const at = await endpointsOf(withChild({ endpoints: [cls], providers: [Access] }));
    const [{ moduleRef }] = Object.values(at) as [{ moduleRef: ModuleRef }];
    expect(moduleRef.get(Access, { strict: false })).toBeInstanceOf(Access);
    expect(() => moduleRef.get(Access)).toThrow(/could not find Access/);
  });

  test('fails an app that has it and a child made after it was loaded', async () => {
    const parent = EndpointRouter.create({ rootDirectory: empty, providers: [Access] });
    const loaded = await parent;
    const child = parent.child({ rootDirectory: empty });
    // By itself, the child has an instance of each of its parent's providers.
    await expect(start(child).then((app) => app.close())).resolves.toBeUndefined();
    // With its parent, which has made its own: the app would have two of each.
    await expect(start(NestjsEndpoints.forRoot(), loaded, child)).rejects.toThrow(
      /child\(\) was called[\s\S]*endpoint-router\.spec[\s\S]*after an app had loaded it/,
    );
  });

  test('takes a child made after it was loaded when it has no providers to make twice', async () => {
    const parent = EndpointRouter.create({ rootDirectory: empty, imports: [ClockModule] });
    const loaded = await parent;
    const child = parent.child({
      rootDirectory: empty,
      providers: [{ provide: 'clock', useExisting: Clock }],
    });
    const app = await start(NestjsEndpoints.forRoot(), loaded, child);
    expect(app.get('clock', { strict: false })).toBeInstanceOf(Clock);
    await app.close();
  });
});

describe('a router in a folder that names a path parameter', () => {
  const nested = async () => {
    const { default: params } = await import('../test/fixtures/routing/params/router.module');
    const [router] = nestedIn(await params);
    return router.controllers![0]!;
  };

  test('has the parameter in its base path, and keeps a `_` folder above it', async () => {
    expect(Reflect.getMetadata('endpoints:path', await nested())).toBe(
      'params/_internal/:id/view/show',
    );
  });

  test('is in the namespace of the router above when it names none of its own', async () => {
    const descriptor = Reflect.getMetadata(DESCRIPTOR_METADATA_KEY, await nested()) as {
      namespaceChain: string[];
    };
    expect(descriptor.namespaceChain).toEqual(['params']);
  });
});

describe("a router's lifecycle hooks", () => {
  class Stamp {
    constructor(readonly at = 7) {}
  }
  const HOOKS = [
    'onModuleInit',
    'onApplicationBootstrap',
    'onModuleDestroy',
    'beforeApplicationShutdown',
    'onApplicationShutdown',
  ] as const;

  test("are called by NestJS as a module's are, with what the router injects into itself on `this`", async () => {
    const calls: string[] = [];
    const router = EndpointRouter.create({
      endpoints: [],
      providers: [Clock, Stamp],
      inject: { clock: Clock, stamp: Stamp },
      context: {
        injectOnRequest: { req: decorated<{ url: string }>(Req()) },
      },
      lifecycle: {
        onModuleInit() {
          expectTypeOf(this.clock).toEqualTypeOf<Clock>();
          // @ts-expect-error not injected
          void this.access;
          // @ts-expect-error given to a handler, per request
          void this.req;
          calls.push(`init ${this.clock instanceof Clock} ${this.stamp.at}`);
        },
        async onApplicationBootstrap() {
          await Promise.resolve();
          calls.push(`bootstrap ${this.stamp.at}`);
        },
        onModuleDestroy() {
          calls.push(`destroy ${this.stamp.at}`);
        },
        beforeApplicationShutdown(signal) {
          expectTypeOf(signal).toEqualTypeOf<string | undefined>();
          calls.push(`before shutdown ${this.stamp.at} ${signal}`);
        },
        onApplicationShutdown(signal) {
          calls.push(`shutdown ${this.stamp.at} ${signal}`);
        },
      },
    });
    const app = await start(router);
    expect(calls).toEqual(['init true 7', 'bootstrap 7']);
    await app.close();
    expect(calls.slice(2)).toEqual([
      'destroy 7',
      'before shutdown 7 undefined',
      'shutdown 7 undefined',
    ]);
  });

  test("have what the router's own `inject` gives, and not what its `context` gives its endpoints", async () => {
    const seen: unknown[] = [];
    const router = EndpointRouter.create({
      endpoints: (): Type[] => [Read],
      providers: [Clock, Access],
      inject: { clock: Clock },
      context: { inject: { access: Access } },
      lifecycle: {
        onModuleInit() {
          expectTypeOf(this.clock).toEqualTypeOf<Clock>();
          // @ts-expect-error its endpoints', not the router's
          void this.access;
          seen.push(this.clock instanceof Clock, 'access' in this);
        },
      },
    });
    const Read = router.endpoint.query({
      path: 'own-and-context',
      handler({ access }) {
        // @ts-expect-error the router's own
        void this.clock;
        return [access instanceof Access, 'clock' in this];
      },
    });
    const app = await start(router);
    expect(seen).toEqual([true, false]);
    await expect(app.get(Read, { strict: false }).invoke()).resolves.toEqual([true, false]);
    await app.close();
  });

  test("of a child have its own `inject` alone: not its parent's, nor a `context`", async () => {
    const seen: unknown[] = [];
    const parent = EndpointRouter.create({
      endpoints: [],
      providers: [Clock, Access],
      inject: { clock: Clock },
      context: { inject: { access: Access } },
    });
    const child = parent.child({
      endpoints: [],
      inject: { mine: Clock },
      lifecycle: {
        onModuleInit() {
          expectTypeOf(this.mine).toEqualTypeOf<Clock>();
          // @ts-expect-error the parent's own
          void this.clock;
          // @ts-expect-error what the routers give their endpoints
          void this.access;
          seen.push(this.mine instanceof Clock, 'clock' in this, 'access' in this);
        },
      },
    });
    const app = await start(child);
    expect(seen).toEqual([true, false, false]);
    await app.close();
  });

  test.each([[null], [1], [[]], ['x']])('refuses a context given as %j', (context) => {
    expect(() => EndpointRouter.create({ endpoints: [], context } as any)).toThrow(
      /EndpointRouter\.create\(\) in .*: `context` must be an object of `params`, `inject`, and `injectOnRequest`\./,
    );
  });

  test('refuses a name in its context that a context does not have, in its types too', () => {
    expect(() =>
      EndpointRouter.create({
        endpoints: [],
        context: {
          // @ts-expect-error not a context's
          providers: [],
        },
      }),
    ).toThrow(
      '`context.providers` is not a key of a context: it takes `params`, `inject`, and `injectOnRequest`.',
    );
  });

  test('of a router with child routers have its providers', async () => {
    const seen: unknown[] = [];
    const parent = EndpointRouter.create({
      endpoints: [],
      providers: [Clock],
      inject: { clock: Clock },
      lifecycle: {
        onModuleInit() {
          seen.push(this.clock);
        },
      },
    });
    const child = parent.child({
      endpoints: [],
      inject: { clock: Clock },
      lifecycle: {
        onModuleInit() {
          seen.push(this.clock);
        },
      },
    });
    const app = await start(NestjsEndpoints.forRoot(), parent, child);
    expect(seen).toEqual([app.get(Clock, { strict: false }), app.get(Clock, { strict: false })]);
    await app.close();
  });

  test('are those of the root router too', async () => {
    const calls: string[] = [];
    const root = NestjsEndpoints.forRoot({
      router: {
        rootDirectory: path.join(fixtures, 'empty'),
        providers: [Clock],
        inject: { clock: Clock },
        lifecycle: {
          onModuleInit() {
            calls.push(`init ${this.clock instanceof Clock}`);
          },
        },
      },
    });
    const app = await start(root);
    await app.close();
    expect(calls).toEqual(['init true']);
  });

  test('written as arrow functions are called, with no `this`', async () => {
    const calls: string[] = [];
    const app = await start(
      EndpointRouter.create({
        endpoints: [],
        lifecycle: {
          onModuleInit: () => void calls.push('init'),
        },
      }),
    );
    await app.close();
    expect(calls).toEqual(['init']);
  });

  test('a router with none has nothing injected into it', async () => {
    // Nothing provides `Stamp`: only an endpoint or a hook would ask for it.
    const app = await start(
      EndpointRouter.create({
        endpoints: [],
        context: {
          inject: { stamp: Stamp },
        },
      }),
    );
    await app.close();
    await expect(
      start(
        EndpointRouter.create({
          endpoints: [],
          inject: { stamp: Stamp },
          lifecycle: {
            onModuleInit() {},
          },
        }),
      ),
    ).rejects.toThrow(/Stamp/);
  });

  test('have the properties and methods the router declares', async () => {
    const log: string[] = [];
    const router = EndpointRouter.create({
      endpoints: [],
      providers: [Clock],
      inject: { clock: Clock },
      properties: () => ({
        notes: [] as string[],
        connection: undefined as { open: boolean } | undefined,
      }),
      methods: {
        note(what: string) {
          this.notes.push(`${what} ${this.clock instanceof Clock} ${this.connection?.open}`);
          return this.notes.length;
        },
      },
      lifecycle: {
        onModuleInit() {
          expectTypeOf<typeof this.note>().toEqualTypeOf<(what: string) => number>();
          if (this.notes.length > 0) {
            // @ts-expect-error not a member
            void this.missing;
            // @ts-expect-error a string
            this.note(1);
          }
          this.connection = { open: true };
          this.note('init');
        },
        onModuleDestroy() {
          this.note('destroy');
          log.push(...this.notes);
        },
      },
    });
    const app = await start(router);
    await app.close();
    expect(log).toEqual(['init true true', 'destroy true true']);
  });

  test('have the getters the router declares in its properties', async () => {
    const seen: unknown[] = [];
    const router = EndpointRouter.create({
      endpoints: [],
      providers: [Clock],
      inject: { clock: Clock },
      properties: () => ({
        starts: 0,
        get started(): boolean {
          return this.starts > 0 && this.clock instanceof Clock;
        },
      }),
      lifecycle: {
        onModuleInit() {
          seen.push(this.started);
          this.starts++;
          seen.push(this.started);
        },
      },
    });
    await (await start(router)).close();
    expect(seen).toEqual([false, true]);
  });

  test('keep a getter that calls a method, and a setter, with the instance as their `this`', async () => {
    const seen: unknown[] = [];
    const router = EndpointRouter.create({
      endpoints: [],
      providers: [Clock],
      inject: { clock: Clock },
      properties: () => ({
        starts: 0,
        get label(): string {
          return this.describe(this.starts);
        },
        set label(value: string) {
          this.starts = value.length;
        },
      }),
      methods: {
        describe(n: number) {
          return `${n} with a clock: ${this.clock instanceof Clock}`;
        },
      },
      lifecycle: {
        onModuleInit() {
          expectTypeOf<typeof this.label>().toEqualTypeOf<string>();
          seen.push(this.label);
          this.label = 'three';
          seen.push(this.starts, this.label);
        },
      },
    });
    await (await start(router)).close();
    expect(seen).toEqual(['0 with a clock: true', 5, '5 with a clock: true']);
  });

  test('give no `this` to another option written as a method', async () => {
    const listed: unknown[] = [];
    const options = {
      properties: () => ({ n: 1 }),
      endpoints() {
        // @ts-expect-error called on nothing: not on the router's instance
        listed.push(this?.n);
        return [];
      },
    };
    await (await start(EndpointRouter.create(options))).close();
    void NestjsEndpoints.forRoot({
      router: {
        properties: () => ({ n: 1 }),
        endpoints() {
          // @ts-expect-error the root router's too
          void this.n;
          return [];
        },
      },
    });
    expect(listed).toEqual([undefined]);
  });

  test("each app has its own of a router's properties", async () => {
    const seen: number[] = [];
    const router = EndpointRouter.create({
      endpoints: [],
      properties: () => ({ starts: 0 }),
      lifecycle: {
        onModuleInit() {
          seen.push(++this.starts);
        },
      },
    });
    await (await start(router)).close();
    await (await start(router)).close();
    expect(seen).toEqual([1, 1]);
  });

  test('keep its properties and methods to the router: its endpoints and child routers have none', async () => {
    const seen: unknown[] = [];
    const parent = EndpointRouter.create({
      endpoints: (): Type[] => [Seen],
      properties: () => ({ own: 1 }),
      methods: { mine() {} },
    });
    const Seen = parent.endpoint.query({
      path: 'seen',
      handler() {
        // @ts-expect-error the router's own
        void this.own;
        return ['own' in this, 'mine' in this];
      },
    });
    const child = parent.child({
      endpoints: [],
      lifecycle: {
        onModuleInit() {
          // @ts-expect-error the parent's own
          void this.mine;
          seen.push('own' in this, 'mine' in this);
        },
      },
    });
    const app = await start(NestjsEndpoints.forRoot(), parent, child);
    expect(seen).toEqual([false, false]);
    await expect(app.get(Seen, { strict: false }).invoke()).resolves.toEqual([false, false]);
    await app.close();
  });

  test('are those of the root router too, with its properties and methods', async () => {
    const calls: string[] = [];
    const root = NestjsEndpoints.forRoot({
      router: {
        rootDirectory: path.join(fixtures, 'empty'),
        properties: () => ({ name: 'root' }),
        methods: {
          named(what: string) {
            return `${what} ${this.name}`;
          },
        },
        lifecycle: {
          onModuleInit() {
            calls.push(this.named('init'));
          },
        },
      },
    });
    await (await start(root)).close();
    expect(calls).toEqual(['init root']);
  });

  describe('have one member of each name on `this`', () => {
    test.each([
      [
        "a method named as the router's own",
        { methods: { configure() {} } },
        '`methods` declares `configure`, a name the router has',
      ],
      [
        'what it injects named as its own',
        { inject: { configure: Clock } },
        '`inject` declares `configure`, a name the router has',
      ],
      [
        'what it injects named as a lifecycle hook',
        { inject: { onModuleInit: Clock } },
        '`inject` declares `onModuleInit`, a lifecycle hook',
      ],
    ])('refuses %s', (_, options, message) => {
      expect(() => EndpointRouter.create({ endpoints: [], ...options } as any)).toThrow(message);
    });

    test('fails the app as it starts for a property named as what is injected', async () => {
      const router = EndpointRouter.create({
        endpoints: [],
        providers: [Clock],
        inject: { clock: Clock },
        // @ts-expect-error injected
        properties: () => ({ clock: 1 }),
      });
      await expect(start(router)).rejects.toThrow(
        /EndpointRouter\.create\(\) in .*: `properties` declares `clock`, which is injected/,
      );
    });

    test('refuses what it injects into itself named as its own, or as a lifecycle hook, in its types too', () => {
      expect(() =>
        EndpointRouter.create({
          endpoints: [],
          inject: {
            // @ts-expect-error the router's own
            configure: Clock,
            // @ts-expect-error a lifecycle hook
            onApplicationShutdown: Clock,
            clock: Clock,
          },
        }),
      ).toThrow('`inject` declares `configure`, a name the router has');
    });

    test("refuses what its context injects named as a member of each endpoint's `this`, in its types too", () => {
      const create = (inject: object) => () =>
        EndpointRouter.create({ endpoints: [], context: { inject } } as any);
      expect(create({ handler: Clock })).toThrow(
        /`context\.inject` declares `handler`, a name each endpoint has: `this` has one member of each name/,
      );
      expect(create({ invoke: Clock })).toThrow(
        '`context.inject` declares `invoke`, a name each endpoint has',
      );
      expect(create({ onModuleInit: Clock })).toThrow(
        '`context.inject` declares `onModuleInit`, a lifecycle hook',
      );
      expect(() =>
        EndpointRouter.create({
          endpoints: [],
          context: {
            inject: {
              // @ts-expect-error a lifecycle hook
              onApplicationShutdown: Clock,
              // @ts-expect-error each endpoint's own
              handler: Clock,
              clock: Clock,
            },
          },
        }),
      ).toThrow('`context.inject` declares `onApplicationShutdown`');
      const parent = EndpointRouter.create({ endpoints: [] });
      expect(() =>
        parent.child({
          endpoints: [],
          context: {
            // @ts-expect-error each endpoint's own
            inject: { invoke: Clock },
          },
        }),
      ).toThrow('`context.inject` declares `invoke`');
    });

    test("takes in its context a name of the router's own: the router's `this` does not have it", () => {
      const router = EndpointRouter.create({
        endpoints: [],
        context: { inject: { configure: Clock, note: Clock } },
        methods: { note() {} },
      });
      expect(router).toBeInstanceOf(Promise);
    });

    test("lets a child's members take the names its parent injects: the child's `this` has none of them", () => {
      const parent = EndpointRouter.create({
        endpoints: [],
        inject: { clock: Clock },
        context: { inject: { access: Clock } },
      });
      expect(() =>
        parent.child({
          endpoints: [],
          // @ts-expect-error a lifecycle hook
          properties: () => ({ onModuleInit: 1 }),
          methods: { clock() {}, access() {} },
        }),
      ).not.toThrow();
    });
  });

  test('options typed with the exported types are taken as they were', () => {
    const ofRouter: EndpointRouterOptions<undefined, undefined, undefined> = { endpoints: [] };
    const ofRoot: NestjsEndpointsOptions = { watch: false };
    const ofInjectingRoot: NestjsEndpointsOptions<{ clock: typeof Clock }> = {
      router: {
        rootDirectory: path.join(fixtures, 'empty'),
        context: {
          inject: { clock: Clock },
        },
      },
    };
    expect(EndpointRouter.create(ofRouter)).toBeInstanceOf(Promise);
    expect(NestjsEndpoints.forRoot(ofRoot)).toBeInstanceOf(Promise);
    expect(NestjsEndpoints.forRoot(ofInjectingRoot)).toBeInstanceOf(Promise);
  });

  test('an option it does not know, and a hook it does not know, are type errors', () => {
    const router = EndpointRouter.create({
      endpoints: [],
      // @ts-expect-error not an option
      unknownOption: 1,
    });
    // @ts-expect-error not an option
    void router.child({ endpoints: [], unknownOption: 1 });
    // @ts-expect-error not an option
    void NestjsEndpoints.forRoot({ router: { unknownOption: 1 } });
    expect(() =>
      EndpointRouter.create({
        endpoints: [],
        lifecycle: {
          // @ts-expect-error not a lifecycle hook
          onInit() {},
        },
      }),
    ).toThrow('`lifecycle.onInit` is not a lifecycle hook');
    expect(() =>
      router.child({
        endpoints: [],
        lifecycle: {
          // @ts-expect-error not a lifecycle hook
          onInit() {},
        },
      }),
    ).toThrow('`lifecycle.onInit` is not a lifecycle hook');
  });

  test.each(HOOKS)('%s must be a function', (hook) => {
    expect(() => EndpointRouter.create({ endpoints: [], lifecycle: { [hook]: 1 } } as any)).toThrow(
      new RegExp(
        `EndpointRouter\\.create\\(\\) in .*: \`lifecycle\\.${hook}\` must be a function\\.`,
      ),
    );
  });
});

describe('a lifecycle hook on what NestJS makes for each request', () => {
  // NestJS calls lifecycle hooks only on what it makes once.
  @Injectable({ scope: Scope.REQUEST })
  class PerRequest {}

  test('of an endpoint fails the app as it starts', async () => {
    const router = EndpointRouter.create({
      endpoints: (): Type[] => [Hooked],
      providers: [PerRequest],
    });
    const Hooked = router.endpoint.query({
      path: 'per-request/hooked',
      inject: { perRequest: PerRequest },
      lifecycle: {
        onModuleInit() {},
        onModuleDestroy() {},
      },
      handler: () => null,
    });
    await expect(start(router)).rejects.toThrow(
      /the endpoint of .*endpoint-router\.spec\.ts declares onModuleInit and onModuleDestroy, but NestJS makes it for each request/,
    );
  });

  test('of an endpoint whose request-scoped dependency is one of its provider fails the app as it starts', async () => {
    // Not request-scoped itself: NestJS makes it for each request for what it depends on.
    @Injectable()
    class UsesPerRequest {
      constructor(@Inject(PerRequest) readonly perRequest: PerRequest) {}
    }
    const router = EndpointRouter.create({
      endpoints: (): Type[] => [Hooked],
      providers: [PerRequest, UsesPerRequest],
    });
    const Hooked = router.endpoint.query({
      path: 'per-request/transitive',
      inject: { uses: UsesPerRequest },
      lifecycle: {
        onApplicationBootstrap() {},
      },
      handler: () => null,
    });
    await expect(start(router)).rejects.toThrow(
      /the endpoint of .* declares onApplicationBootstrap, but NestJS makes it for each request/,
    );
  });

  test("of an endpoint that injects NestJS's REQUEST fails the app as it starts", async () => {
    const router = EndpointRouter.create({ endpoints: (): Type[] => [Hooked] });
    const Hooked = router.endpoint.query({
      path: 'per-request/request',
      inject: { request: decorated<{ url: string }>(Inject(REQUEST)) },
      lifecycle: {
        onModuleDestroy() {},
      },
      handler: () => null,
    });
    await expect(start(router)).rejects.toThrow(
      /the endpoint of .* declares onModuleDestroy, but NestJS makes it for each request/,
    );
  });

  test('of a router whose request-scoped dependency is one of its provider fails the app as it starts', async () => {
    @Injectable()
    class UsesPerRequest {
      constructor(@Inject(PerRequest) readonly perRequest: PerRequest) {}
    }
    const router = EndpointRouter.create({
      endpoints: [],
      providers: [PerRequest, UsesPerRequest],
      inject: { uses: UsesPerRequest },
      lifecycle: {
        onModuleInit() {},
      },
    });
    await expect(start(router)).rejects.toThrow(
      /the router of .* declares onModuleInit, but NestJS makes it for each request/,
    );
  });

  test('of a router fails the app as it starts', async () => {
    const router = EndpointRouter.create({
      endpoints: [],
      providers: [PerRequest],
      inject: { perRequest: PerRequest },
      lifecycle: {
        onApplicationShutdown() {},
      },
    });
    await expect(start(router)).rejects.toThrow(
      /the router of .*endpoint-router\.spec\.ts declares onApplicationShutdown, but NestJS makes it for each request/,
    );
  });

  test('of an endpoint in a module of its own fails an app that has a root', async () => {
    const Hooked = endpoint.query({
      path: 'per-request/in-a-module',
      inject: { perRequest: PerRequest },
      lifecycle: {
        onModuleInit() {},
      },
      handler: () => null,
    });
    @Module({ controllers: [Hooked], providers: [PerRequest] })
    class OwnModule {}
    await expect(start(NestjsEndpoints.forRoot(), OwnModule)).rejects.toThrow(
      /the endpoint of .* declares onModuleInit/,
    );
  });

  test('of an endpoint in an app with no router and no root fails each request for it', async () => {
    // Nothing of this package starts with such an app: the endpoint tells when it is made.
    const Hooked = endpoint.query({
      path: 'per-request/no-root',
      inject: { perRequest: PerRequest },
      lifecycle: {
        onModuleInit() {},
      },
      handler: () => null,
    });
    @Module({ controllers: [Hooked], providers: [PerRequest] })
    class OwnModule {}
    const app = await start(OwnModule);
    await expect(app.resolve(Hooked, undefined, { strict: false })).rejects.toThrow(
      /the endpoint of .* declares onModuleInit, but NestJS makes it for each request/,
    );
    await app.close();
  });

  test('is called when a guard of its router is made for each request: the endpoint is not', async () => {
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
      guards: [PerRequestGuard],
    });
    let initialized = 0;
    const Hooked = router.endpoint.query({
      path: 'per-request/guarded',
      lifecycle: {
        onModuleInit() {
          initialized++;
        },
      },
      handler: () => null,
    });
    const app = await start(router);
    expect(initialized).toBe(1);
    await app.close();
  });

  test('is not asked of a router with none, which starts with its properties and methods', async () => {
    const router = EndpointRouter.create({
      endpoints: [],
      providers: [PerRequest],
      context: {
        inject: { perRequest: PerRequest },
      },
      properties: () => ({ starts: 0 }),
      methods: { started() {} },
    });
    await expect(start(router).then((app) => app.close())).resolves.toBeUndefined();
  });

  test('is not asked of one with none: it has its properties and methods, for each request', async () => {
    const router = EndpointRouter.create({
      endpoints: (): Type[] => [Counted],
      providers: [PerRequest],
    });
    const Counted = router.endpoint.query({
      path: 'per-request/counted',
      inject: { perRequest: PerRequest },
      properties: () => ({ calls: 0 }),
      methods: {
        count() {
          return ++this.calls;
        },
      },
      handler() {
        return this.count();
      },
    });
    const app = await start(router);
    const made = () => app.resolve(Counted, undefined, { strict: false });
    const [one, other] = [await made(), await made()];
    expect(one).not.toBe(other);
    await one.invoke();
    await expect(one.invoke()).resolves.toBe(2);
    await expect(other.invoke()).resolves.toBe(1);
    await app.close();
  });
});

describe("what a child router's endpoints get from the routers above it", () => {
  const WHICH = Symbol('which');
  const valued = (value: string) => ({ provide: WHICH, useValue: value });
  /** A module that exports `WHICH` as `value`. */
  const exporting = (value: string) => {
    class Exporting {}
    Module({ providers: [valued(value)], exports: [WHICH] })(Exporting);
    return Exporting;
  };

  test.each([
    [
      'its own provider',
      { child: true, childImport: true, parent: true, parentImport: true },
      'child provider',
    ],
    ['its own import', { childImport: true, parent: true, parentImport: true }, 'child import'],
    ["its parent's provider", { parent: true, parentImport: true }, 'parent provider'],
    ["its parent's import", { parentImport: true }, 'parent import'],
  ])('is %s before what is further up', async (_, levels, expected) => {
    const parent = EndpointRouter.create({
      endpoints: [],
      providers: 'parent' in levels ? [valued('parent provider')] : [],
      imports: 'parentImport' in levels ? [exporting('parent import')] : [],
    });
    const child = parent.child({
      endpoints: (): Type[] => [Which],
      providers: 'child' in levels ? [valued('child provider')] : [],
      imports: 'childImport' in levels ? [exporting('child import')] : [],
    });
    const Which = child.endpoint.query({
      path: `which-${Math.random()}`,
      inject: { which: decorated<string>(Inject(WHICH)) },
      handler() {
        return this.which;
      },
    });
    const app = await start(NestjsEndpoints.forRoot(), parent, child);
    await expect(app.get(Which, { strict: false }).invoke()).resolves.toBe(expected);
    await app.close();
  });

  describe('when one of them, three levels up, injects a request-scoped provider', () => {
    @Injectable({ scope: Scope.REQUEST })
    class PerRequest {
      static made = 0;
      readonly id = ++PerRequest.made;
    }
    /** Routers, from the top: the top injects `PerRequest`; each has one endpoint. */
    const lineage = (bottom: { lifecycle?: { onModuleInit?: () => void } } = {}) => {
      const top = EndpointRouter.create({
        endpoints: (): Type[] => [atTop],
        providers: [PerRequest],
        context: {
          inject: { perRequest: PerRequest },
        },
      });
      const one = top.child({ endpoints: [] });
      const two = one.child({ endpoints: (): Type[] => [atTwo] });
      const three = two.child({ endpoints: (): Type[] => [atThree], ...bottom });
      const handler = function (this: { perRequest: PerRequest }) {
        return this.perRequest.id;
      };
      const atTop = top.endpoint.query({ path: `top-${Math.random()}`, handler });
      const atTwo = two.endpoint.query({ path: `two-${Math.random()}`, handler });
      const atThree = three.endpoint.query({ path: `three-${Math.random()}`, handler });
      return { routers: [top, one, two, three], endpoints: [atTop, atTwo, atThree] };
    };

    test('every endpoint under it is made for each request, as NestJS makes what depends on one', async () => {
      const { routers, endpoints } = lineage();
      const app = await start(NestjsEndpoints.forRoot(), ...routers);
      for (const cls of endpoints) {
        // NestJS has no instance made once to give.
        expect(() => app.get(cls, { strict: false })).toThrow(/scoped/);
      }
      const request = ContextIdFactory.create();
      const other = ContextIdFactory.create();
      const resolve = (cls: Type, contextId: ContextId) =>
        app.resolve<{ invoke: () => Promise<number> }>(cls, contextId, { strict: false });
      const [top, , three] = endpoints as [Type, Type, Type];
      const inRequest = [await resolve(top, request), await resolve(three, request)];
      const inOther = await resolve(three, other);
      // One provider for each request, which every endpoint in it shares.
      const [a, b, c] = await Promise.all([...inRequest, inOther].map((e) => e.invoke()));
      expect(a).toBe(b);
      expect(c).not.toBe(a);
      // And an endpoint instance for each request.
      expect(inOther).not.toBe(inRequest[1]);
      await app.close();
    });

    test("a router under it that declares a lifecycle hook starts, and calls it: the provider is its endpoints', not its own", async () => {
      const calls: string[] = [];
      const { routers, endpoints } = lineage({
        lifecycle: {
          onModuleInit: () => void calls.push('init'),
        },
      });
      const app = await start(NestjsEndpoints.forRoot(), ...routers);
      expect(calls).toEqual(['init']);
      const atThree = await app.resolve<{ invoke: () => Promise<number> }>(
        endpoints[2]!,
        ContextIdFactory.create(),
        { strict: false },
      );
      await expect(atThree.invoke()).resolves.toBeTypeOf('number');
      await app.close();
    });
  });

  test('a transient provider of a router above is made for each endpoint that injects it', async () => {
    @Injectable({ scope: Scope.TRANSIENT })
    class Each {
      static made = 0;
      readonly id = ++Each.made;
    }
    const top = EndpointRouter.create({
      endpoints: [],
      providers: [Each],
      context: {
        inject: { each: Each },
      },
    });
    const middle = top.child({ endpoints: (): Type[] => [atMiddle] });
    const bottom = middle.child({ endpoints: (): Type[] => [atBottom] });
    const handler = function (this: { each: Each }) {
      return this.each.id;
    };
    const atMiddle = middle.endpoint.query({ path: `middle-${Math.random()}`, handler });
    const atBottom = bottom.endpoint.query({ path: `bottom-${Math.random()}`, handler });
    const app = await start(NestjsEndpoints.forRoot(), top, middle, bottom);
    const ids = await Promise.all(
      [atMiddle, atBottom].map((cls) =>
        app.get<{ invoke: () => Promise<number> }>(cls, { strict: false }).invoke(),
      ),
    );
    // Made once for each, as the app starts: both are made once.
    expect(new Set(ids).size).toBe(2);
    await app.close();
  });
});
