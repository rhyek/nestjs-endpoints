import { Req } from '@nestjs/common';
import { decorated, endpoint } from './endpoint-fn.js';
import { EndpointRouter, EndpointRouterModule } from './endpoint-router.module.js';
import { moduleAls } from './helpers.js';

describe('a router no endpoint manifest covers', () => {
  test('fails at bootstrap with the fix', async () => {
    await expect(EndpointRouterModule.create({ rootDirectory: '/nowhere' })).rejects.toThrow(
      /no endpoint manifest covers[\s\S]*npx nestjs-endpoints init[\s\S]*setupFiles/,
    );
  });

  test('is fine when it only lists its endpoints, having nothing to discover', async () => {
    const module = await EndpointRouterModule.create({ endpoints: [] });
    expect(module.controllers).toEqual([]);
  });

  test('still fails when it also names a root directory', async () => {
    await expect(
      EndpointRouterModule.create({
        rootDirectory: '/nowhere',
        endpoints: [],
      }),
    ).rejects.toThrow(/no endpoint manifest covers/);
  });
});

test('a router imports the endpoints a callback lists when it runs', async () => {
  const ping = endpoint.query({ path: 'ping', handler: () => 'pong' });
  const pong = endpoint.query({ path: 'pong', handler: () => 'ping' });
  const pung = endpoint.query({ path: 'pung', handler: () => 'pang' });
  const pang = endpoint.query({ path: 'pang', handler: () => 'pung' });
  let called = false;
  const router = EndpointRouterModule.create({
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

test('a router fails when a module its callback lists exports no endpoint', async () => {
  await expect(
    EndpointRouterModule.create({
      endpoints: () => [Promise.resolve({ pangInput: {} })],
    }),
  ).rejects.toThrow(/endpoint-router\.module\.spec[\s\S]*exports no endpoint/);
});

test('a top-level router stays top-level when another router awaits it first', async () => {
  const ping = endpoint.query({ path: 'ping', handler: () => 'pong' });
  const router = EndpointRouterModule.create({ endpoints: [ping] });
  // What a parent router does when a file it discovered default-exports a
  // router that was already created outside any router.
  await moduleAls.run(
    {
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

describe("a router's endpointConfig", () => {
  class Service {}

  test('may not declare a key in both inject and injectOnRequest', () => {
    expect(() =>
      EndpointRouterModule.create({
        endpoints: [],
        endpointConfig: {
          inject: { user: Service },
          // @ts-expect-error `user` is in both inject and injectOnRequest
          injectOnRequest: { user: decorated<string>(Req()) },
        },
      }),
    ).toThrow(
      /EndpointRouterModule\.create\(\) in [\s\S]*endpoint-router\.module\.spec[\s\S]*`user` is in both `inject` and `injectOnRequest`/,
    );
  });

  test('types its endpoints from either map, or both', () => {
    expectTypeOf(EndpointRouterModule.create({ endpoints: [] })).toEqualTypeOf<EndpointRouter>();
    expectTypeOf(
      EndpointRouterModule.create({
        endpoints: [],
        endpointConfig: { inject: { service: Service } },
      }),
    ).toEqualTypeOf<EndpointRouter<{ service: typeof Service }>>();
    expectTypeOf(
      EndpointRouterModule.create({
        endpoints: [],
        endpointConfig: {
          injectOnRequest: { user: decorated<string>(Req()) },
        },
      }),
    ).toEqualTypeOf<EndpointRouter<undefined, { user: ReturnType<typeof decorated<string>> }>>();
    EndpointRouterModule.create({
      endpoints: [],
      endpointConfig: {
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
