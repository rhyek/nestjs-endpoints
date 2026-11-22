import path from 'node:path';
import { DynamicModule, Req } from '@nestjs/common';
import { decorated, endpoint } from './endpoint-fn';
import { EndpointRouter, EndpointRouterModule, LazyPromise } from './endpoint-router.module';
import { moduleAls } from './helpers';

const fixtures = path.resolve(import.meta.dirname, '../test/fixtures/routing');
const pathsOf = (module: DynamicModule) =>
  (module.controllers ?? []).map((c) => Reflect.getMetadata('endpoints:path', c) as string).sort();

describe('a router finds its endpoint files where the app runs', () => {
  test('serves the endpoint files in its root directory, and those of a nested router', async () => {
    const module = await EndpointRouterModule.create({
      rootDirectory: path.join(fixtures, 'basic'),
    });
    expect(pathsOf(module)).toEqual(['a', 'b']);
    const [shop] = module.imports as DynamicModule[];
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
    const module = await EndpointRouterModule.create({ rootDirectory });
    expect(module.controllers).toEqual([]);
  });

  test('takes the TypeScript file where a compiled twin sits beside it', async () => {
    const module = await EndpointRouterModule.create({
      rootDirectory: path.join(fixtures, 'twins'),
    });
    expect(pathsOf(module)).toEqual(['a']);
  });

  test('fails with the error of an endpoint file that throws while it loads', async () => {
    const failure = await EndpointRouterModule.create({
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

describe('LazyPromise', () => {
  test('is a Promise, and does nothing until awaited', async () => {
    const run = vi.fn(() => Promise.resolve(42));
    const lazy = new LazyPromise(run);
    expect(lazy).toBeInstanceOf(Promise);
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();
    await expect(lazy).resolves.toBe(42);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('runs once and shares the result between concurrent awaits', async () => {
    const run = vi.fn(() => Promise.resolve({}));
    const lazy = new LazyPromise(run);
    const [a, b] = await Promise.all([lazy, lazy]);
    expect(a).toBe(b);
    expect(await lazy).toBe(a);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('passes rejections to catch and finally', async () => {
    const onFinally = vi.fn();
    const lazy = new LazyPromise<number>(() => Promise.reject(new Error('boom')));
    await expect(lazy.catch((e: unknown) => (e as Error).message)).resolves.toBe('boom');
    await expect(lazy.finally(onFinally)).rejects.toThrow('boom');
    expect(onFinally).toHaveBeenCalledTimes(1);
  });
});
