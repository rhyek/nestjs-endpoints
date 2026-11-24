import { Injectable, Module, Req, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import z from 'zod';
import { DESCRIPTOR_METADATA_KEY, type EndpointDescriptor } from './descriptors';
import { createRouterEndpoint, endpoint, type EndpointBuilders } from './endpoint-fn';
import { ZodValidationException } from './exceptions';
import { decorated } from './injections';
import { loneValuesAsArrays } from './object-parameters';

// The reader `loneValuesAsArrays` decides on is wrapped, to count the
// decisions and the requests the reader reads.
vi.mock('./object-parameters', async (importOriginal) => {
  const original = await importOriginal<typeof import('./object-parameters')>();
  return {
    ...original,
    loneValuesAsArrays: vi.fn((parameters: Parameters<typeof original.loneValuesAsArrays>[0]) => {
      const read = original.loneValuesAsArrays(parameters);
      return read && vi.fn(read);
    }),
  };
});
const decide = vi.mocked(loneValuesAsArrays);

class Service {}

const routerFile = '/app/accounts/router.module.ts';

describe("a router's endpoint builders", () => {
  test('are the package builders when the router gives nothing', () => {
    expect(createRouterEndpoint(routerFile, {})).toBe(endpoint);
    expect(createRouterEndpoint(routerFile, { inject: {}, injectOnRequest: {} })).toBe(endpoint);
  });

  describe('give way to a key the endpoint declares itself', () => {
    const ofRouter = vi.fn();
    const ofEndpoint = vi.fn();
    // Typed as the router's own `endpoint` is.
    const router = createRouterEndpoint(routerFile, {
      injectOnRequest: { user: decorated(ofRouter) },
    }) as EndpointBuilders<undefined, { user: ReturnType<typeof decorated<'router'>> }>;
    beforeEach(() => {
      ofRouter.mockClear();
      ofEndpoint.mockClear();
    });

    test('in injectOnRequest, given under a deprecated name too', () => {
      router.query({
        path: 'own-on-request',
        injectMethod: { user: decorated<'endpoint'>(ofEndpoint) },
        handler: ({ user }) => {
          expectTypeOf(user).toEqualTypeOf<'endpoint'>();
          return null;
        },
      });
      expect(ofEndpoint).toHaveBeenCalledOnce();
      expect(ofRouter).not.toHaveBeenCalled();
    });

    test('in inject, though the router injects it on request', async () => {
      const cls = router.query({
        path: 'own-inject',
        inject: { user: Service },
        handler: ({ user }) => {
          expectTypeOf(user).toEqualTypeOf<Service>();
          return user;
        },
      });
      expect(ofRouter).not.toHaveBeenCalled();
      // What Nest would set on the instance is what the handler is given.
      const service = new Service();
      await expect(Object.assign(new cls(), { user: service }).invoke()).resolves.toBe(service);
    });
  });

  test.each([
    ['the package builders', endpoint],
    ["a router's", createRouterEndpoint(routerFile, { inject: { other: Service } })],
  ])(
    'with %s, refuse a key the endpoint declares in both inject and injectOnRequest',
    (_, builders) => {
      expect(() =>
        builders.query({
          path: 'both-maps',
          inject: { user: Service },
          // @ts-expect-error the handler has one parameter of that name
          injectOnRequest: { user: decorated(vi.fn()) },
          handler: () => null,
        }),
      ).toThrow(
        /endpoint\.query\(\) in .*endpoint-fn\.spec.*: `user` is in both `inject` and `injectOnRequest`\./,
      );
      // Under a deprecated name too.
      expect(() =>
        builders.mutation({
          path: 'both-maps-deprecated',
          inject: { user: Service },
          // @ts-expect-error the handler has one parameter of that name
          injectMethod: { user: decorated(vi.fn()) },
          handler: () => null,
        }),
      ).toThrow('`user` is in both `inject` and `injectOnRequest`');
    },
  );

  test('are checked against the router that sets the endpoint up', () => {
    const router = createRouterEndpoint(routerFile, { inject: { service: Service } });
    const cls = router.query({ path: 'owned', handler: () => null });
    const setupFn = Reflect.getMetadata('endpoints:setupFn', cls);
    const settings = {
      rootDirectories: [],
      basePath: '',
      namespaceChain: [],
    };
    expect(() =>
      setupFn({
        ...settings,
        routerFile: '/app/billing/router.module.ts',
      }),
    ).toThrow(
      /endpoint-fn\.spec[\s\S]*accounts[/\\]router\.module[\s\S]*billing[/\\]router\.module[\s\S]*Build it with the `endpoint` of the router module that owns it/,
    );
    expect(() => setupFn({ ...settings, routerFile })).not.toThrow();
  });
});

describe("an endpoint's params", () => {
  /** Sets the endpoint up as the router of `routerFile` does, under `basePath`. */
  const setUp = (cls: object, basePath = '') =>
    (Reflect.getMetadata('endpoints:setupFn', cls) as (settings: object) => void)({
      rootDirectories: [],
      namespaceChain: [],
      basePath,
      routerFile,
    });

  test('fail where the URL a router gives the endpoint lacks one of their keys', () => {
    const cls = endpoint.query({
      path: 'view',
      params: z.object({ clinicId: z.string(), visitId: z.string().optional() }),
      handler: () => null,
    });
    expect(() => setUp(cls, 'clinics/:clinicId')).toThrow(
      /endpoint-fn\.spec\.ts: its `params` include `visitId`, but its URL, \/clinics\/:clinicId\/view, has no `:visitId`\. Remove it from `params`, or add it to the URL: a `\$visitId` folder or file name, or `:visitId` in `path`\./,
    );
  });

  test('fail so too when they are behind a transform', () => {
    const cls = endpoint.query({
      path: 'view',
      params: z.object({ clinicId: z.string() }).transform((p) => p),
      handler: () => null,
    });
    expect(() => setUp(cls, 'clinics')).toThrow('its `params` include `clinicId`');
  });

  test('are taken when each key is in the URL, a base path one too', () => {
    const cls = endpoint.query({
      path: 'visits/:visitId',
      params: z.object({ clinicId: z.string(), visitId: z.coerce.number() }),
      handler: () => null,
    });
    expect(() => setUp(cls, 'clinics/:clinicId')).not.toThrow();
  });

  test.each([
    ['a wildcard', 'files/*rest', 'rest'],
    ['a parameter with text after it', 'files/:name.json', 'name'],
    ['a parameter in braces', 'files{/:folder}/list', 'folder'],
    ['the second parameter of a segment', 'moves/:fromId-:from', 'from'],
    ['a parameter with a quoted name', 'files/:"file-name"', 'file-name'],
  ])('are found in the URL as %s', (_, path, key) => {
    const cls = endpoint.query({
      path,
      params: z.object({ [key]: z.string().optional() }),
      handler: () => null,
    });
    expect(() => setUp(cls)).not.toThrow();
  });

  test.each([
    ['a longer name that starts as theirs', 'files/:names'],
    ['a name that goes on with `$`', 'files/:name$x'],
    ['text that only looks like a parameter', String.raw`files/\:name`],
  ])('are not found in %s', (_, path) => {
    const cls = endpoint.query({
      path,
      params: z.object({ name: z.string().optional() }),
      handler: () => null,
    });
    expect(() => setUp(cls)).toThrow('its `params` include `name`');
  });

  test.each([
    ['files/:name.json', 'name', '/r/files/{name}.json', 'RFilesJson'],
    ['files/*rest', 'rest', '/r/files/{rest}', 'RFiles'],
    ['files{/:folder}/list', 'folder', '/r/files/{folder}/list', 'RFilesList'],
    ['files/:"file-name"/view', 'file-name', '/r/files/{file-name}/view', 'RFilesView'],
  ])('are described for the clients as the URL %s has them', (path, key, openApiPath, name) => {
    const cls = endpoint.query({
      path,
      params: z.object({ [key]: z.string().optional() }),
      handler: () => null,
    });
    setUp(cls, 'r');
    const descriptor = Reflect.getMetadata(DESCRIPTOR_METADATA_KEY, cls) as EndpointDescriptor;
    expect(descriptor).toMatchObject({
      path: openApiPath,
      operationId: name,
      tags: ['r/files'],
      pathParams: [{ name: key }],
    });
  });

  test('are listed in the order the URL has them, whichever declares them', () => {
    const router = createRouterEndpoint(routerFile, {
      params: z.object({ clinicId: z.string() }),
    }) as EndpointBuilders<undefined, undefined, z.ZodObject<{ clinicId: z.ZodString }>>;
    const cls = router.query({
      path: ':region/clinics/:clinicId/visits/:visitId',
      params: z.object({ visitId: z.string(), region: z.string() }),
      handler: () => null,
    });
    setUp(cls);
    const descriptor = Reflect.getMetadata(DESCRIPTOR_METADATA_KEY, cls) as EndpointDescriptor;
    expect(descriptor.pathParams.map((p) => p.name)).toEqual(['region', 'clinicId', 'visitId']);
    expect(descriptor.params?.parameters.map((p) => p.name)).toEqual([
      'region',
      'clinicId',
      'visitId',
    ]);
  });

  test('are not checked until a router sets the endpoint up', () => {
    // Evaluated outside any router, it is set up at once, with no base path yet.
    expect(() =>
      endpoint.query({
        path: 'view',
        params: z.object({ clinicId: z.string() }),
        handler: () => null,
      }),
    ).not.toThrow();
  });
});

describe("a router's params", () => {
  const clinicId = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
  const routerParams = z.object({ clinicId: z.uuid() });
  // Typed as the router's own `endpoint` is.
  const router = createRouterEndpoint(routerFile, { params: routerParams }) as EndpointBuilders<
    undefined,
    undefined,
    typeof routerParams
  >;

  test('are the params of an endpoint that declares none', async () => {
    const cls = router.query({
      path: ':clinicId/view',
      handler: ({ params, schemas }) => {
        expectTypeOf(params).toEqualTypeOf<{ clinicId: string }>();
        expect(schemas.params).toBe(routerParams);
        return params;
      },
    });
    await expect(new cls().invoke({ params: { clinicId } })).resolves.toEqual({ clinicId });
    await expect(new cls().invoke({ params: { clinicId: 'no' } })).rejects.toThrow(
      ZodValidationException,
    );
    await expect(new cls().invoke()).rejects.toThrow(ZodValidationException);
  });

  test('with no key, leave invoke() its params to omit', async () => {
    const empty = z.object({});
    const none = createRouterEndpoint(routerFile, { params: empty }) as EndpointBuilders<
      undefined,
      undefined,
      typeof empty
    >;
    const cls = none.query({ path: 'none', handler: ({ params }) => params });
    await expect(new cls().invoke()).resolves.toEqual({});
    await expect(new cls().invoke({ params: {} })).resolves.toEqual({});
    // An endpoint's own with no key, and its search params, too.
    const own = endpoint.query({
      path: 'own-none',
      method: 'get',
      params: z.object({}),
      query: z.object({ q: z.string().optional() }),
      handler: ({ query }) => query,
    });
    await expect(new own().invoke()).resolves.toEqual({});
    await expect(new own().invoke({ query: { q: 'a' } })).resolves.toEqual({ q: 'a' });
  });

  test("are under the endpoint's own, key by key", async () => {
    const cls = router.mutation({
      path: ':clinicId/visits/:visitId',
      params: z.strictObject({ visitId: z.coerce.number() }),
      handler: ({ params }) => {
        expectTypeOf(params).toEqualTypeOf<{ clinicId: string; visitId: number }>();
        return params;
      },
    });
    await expect(new cls().invoke({ params: { clinicId, visitId: '7' } })).resolves.toEqual({
      clinicId,
      visitId: 7,
    });
  });

  test("give way to the endpoint's schema for a key both declare", async () => {
    const cls = router.query({
      path: ':clinicId/legacy',
      params: z.object({ clinicId: z.coerce.number() }),
      handler: ({ params }) => {
        expectTypeOf(params).toEqualTypeOf<{ clinicId: number }>();
        return params;
      },
    });
    await expect(new cls().invoke({ params: { clinicId: '12' } })).resolves.toEqual({
      clinicId: 12,
    });
  });

  test('do not merge with params that are not a plain object', () => {
    expect(() =>
      router.query({
        path: ':clinicId/transformed',
        // @ts-expect-error a transformed object cannot be merged with the router's params
        params: z.object({ visitId: z.string() }).transform((x) => x),
        handler: () => null,
      }),
    ).toThrow(
      /endpoint\.query\(\) in [\s\S]*endpoint-fn\.spec[\s\S]*`params` must be a plain z\.object\(\)[\s\S]*accounts[/\\]router\.module/,
    );
  });

  describe('must be in the URL of each endpoint', () => {
    const settings = { rootDirectories: [], namespaceChain: [], basePath: 'clinics' };
    const setupFnOf = (path: string) =>
      Reflect.getMetadata('endpoints:setupFn', router.query({ path, handler: () => null })) as (
        s: typeof settings & { routerFile?: string },
      ) => void;

    test('when a router sets it up', () => {
      expect(() => setupFnOf('list')({ ...settings, routerFile })).toThrow(
        /endpoint-fn\.spec[\s\S]*`clinicId`[\s\S]*\/clinics\/list[\s\S]*accounts[/\\]router\.module/,
      );
      expect(() => setupFnOf(':clinicId/view')({ ...settings, routerFile })).not.toThrow();
    });

    test('but not when it is loaded on its own', () => {
      expect(() => setupFnOf('list')(settings)).not.toThrow();
    });
  });
});

describe('how an endpoint reads its search parameters', () => {
  beforeEach(() => {
    decide.mockClear();
  });

  /** Calls the endpoint as Nest would, with these search parameters. */
  const call = (cls: unknown, query: Record<string, unknown>) =>
    new (cls as new () => { invoke: (opts: object) => Promise<unknown> })().invoke({ query });

  test('is decided once, and without array parameters reads nothing per request', async () => {
    const cls = endpoint.query({
      path: 'no-arrays',
      method: 'get',
      query: z.object({ q: z.string(), add: z.object({ a: z.coerce.number() }).optional() }),
      handler: ({ query }) => query,
    });
    await expect(call(cls, { q: 'a' })).resolves.toEqual({ q: 'a' });
    await expect(call(cls, { q: 'b' })).resolves.toEqual({ q: 'b' });
    expect(decide).toHaveBeenCalledTimes(1);
    // No reader: the search parameters are validated as they come.
    expect(decide.mock.results[0].value).toBeNull();
  });

  test('is decided once, and with array parameters reads each request with that decision', async () => {
    const cls = endpoint.query({
      path: 'arrays',
      method: 'get',
      query: z.object({ tags: z.array(z.string()), q: z.string().optional() }),
      handler: ({ query }) => query,
    });
    await expect(call(cls, { tags: 'a' })).resolves.toEqual({ tags: ['a'] });
    await expect(call(cls, { tags: ['a', 'b'], q: 'x' })).resolves.toEqual({
      tags: ['a', 'b'],
      q: 'x',
    });
    // A missing array is the schema's to refuse, as it comes.
    await expect(call(cls, {})).rejects.toBeInstanceOf(ZodValidationException);
    expect(decide).toHaveBeenCalledTimes(1);
    const read = decide.mock.results[0].value as ReturnType<typeof vi.fn>;
    expect(read).toHaveBeenCalledTimes(3);
  });

  test('is decided again by each setup, and by no request', async () => {
    const cls = endpoint.query({
      path: 'set-up',
      method: 'get',
      query: z.object({ tags: z.array(z.string()) }),
      handler: ({ query }) => query,
    });
    // An endpoint outside a router module is set up where it is defined.
    expect(decide).toHaveBeenCalledTimes(1);
    const setupFn = Reflect.getMetadata('endpoints:setupFn', cls);
    setupFn({ rootDirectories: [], basePath: '', namespaceChain: [] });
    expect(decide).toHaveBeenCalledTimes(2);
    await expect(call(cls, { tags: 'a' })).resolves.toEqual({ tags: ['a'] });
    await expect(call(cls, { tags: 'b' })).resolves.toEqual({ tags: ['b'] });
    expect(decide).toHaveBeenCalledTimes(2);
    // The requests read with the latest setup's reader.
    expect(decide.mock.results[0].value).not.toHaveBeenCalled();
    expect(decide.mock.results[1].value).toHaveBeenCalledTimes(2);
  });
});

describe("an endpoint's `this`", () => {
  @Injectable()
  class Users {
    find(id: number) {
      return { id, name: `user ${id}` };
    }
  }
  @Injectable()
  class Clock {
    now() {
      return 7;
    }
  }

  /** Starts an app that has `endpoints`, short of listening. */
  async function start(...endpoints: Type[]) {
    @Module({ controllers: endpoints, providers: [Users, Clock] })
    class AppModule {}
    return NestFactory.createApplicationContext(AppModule, { logger: false, abortOnError: false });
  }

  test('is given to a handler written as a method, with what the endpoint injects', async () => {
    const Find = endpoint.query({
      path: 'this/inject',
      inject: { users: Users },
      input: z.object({ id: z.number() }),
      handler({ input, users }) {
        expectTypeOf(this.users).toEqualTypeOf<Users>();
        expect(this.users).toBe(users);
        // @ts-expect-error the endpoint does not inject it
        void this.clock;
        return this.users.find(input.id);
      },
    });
    const app = await start(Find);
    await expect(app.get(Find).invoke({ input: { id: 2 } })).resolves.toEqual({
      id: 2,
      name: 'user 2',
    });
    await app.close();
  });

  test("has what the endpoint's router injects, under the endpoint's own", async () => {
    const router = createRouterEndpoint(routerFile, {
      inject: { users: Users, clock: Clock },
    }) as EndpointBuilders<{ users: typeof Users; clock: typeof Clock }>;
    const Now = router.query({
      path: 'this/router',
      inject: { users: Clock },
      handler() {
        expectTypeOf(this.users).toEqualTypeOf<Clock>();
        expectTypeOf(this.clock).toEqualTypeOf<Clock>();
        return [this.users.now(), this.clock.now()];
      },
    });
    const app = await start(Now);
    await expect(app.get(Now).invoke()).resolves.toEqual([7, 7]);
    await app.close();
  });

  test('does not have what a request gives the handler', async () => {
    const Url = endpoint.query({
      path: 'this/request',
      injectOnRequest: { req: decorated<{ url: string }>(Req()) },
      input: z.object({ id: z.number() }),
      handler({ input }) {
        // @ts-expect-error given to the handler, per request
        void this.req;
        // @ts-expect-error given to the handler, per request
        void this.input;
        return [input.id, 'req' in this, 'input' in this];
      },
    });
    await expect(new Url().invoke({ input: { id: 1 } })).resolves.toEqual([1, false, false]);
  });

  test('has the properties the endpoint declares, made for each instance', async () => {
    let made = 0;
    const Count = endpoint.mutation({
      path: 'this/properties',
      properties: () => {
        made++;
        return { seen: new Set<string>(), hits: 0 };
      },
      input: z.object({ name: z.string() }),
      handler({ input }) {
        expectTypeOf(this.hits).toEqualTypeOf<number>();
        // @ts-expect-error not a property
        void this.misses;
        this.seen.add(input.name);
        return ++this.hits;
      },
    });
    // Asked for by each instance, and by nothing before one is made.
    expect(made).toBe(0);
    const one = new Count();
    const other = new Count();
    expect(made).toBe(2);
    await one.invoke({ input: { name: 'a' } });
    await expect(one.invoke({ input: { name: 'b' } })).resolves.toBe(2);
    await expect(other.invoke({ input: { name: 'c' } })).resolves.toBe(1);
    expect([...one.seen]).toEqual(['a', 'b']);
    expect([...other.seen]).toEqual(['c']);
  });

  test('has no `this` in another option written as a method', () => {
    const Made = endpoint.query({
      path: 'this/not-here',
      properties() {
        // Called on nothing, which a read would show.
        expect(this).toBeUndefined();
        // @ts-expect-error the function makes the properties: it has no instance
        const check = () => this.n;
        void check;
        return { n: 1 };
      },
      handler() {
        return this.n;
      },
    });
    expect(new Made().n).toBe(1);
  });

  test('has properties that hold anything, as a field of a class does', async () => {
    const Held = endpoint.query({
      path: 'this/properties-held',
      properties: () => ({
        users: new Users(),
        run: () => 1,
        opened: undefined as Date | undefined,
      }),
      lifecycle: {
        onModuleInit() {
          this.opened = new Date(5);
        },
      },
      handler() {
        expectTypeOf(this.opened).toEqualTypeOf<Date | undefined>();
        return [this.users.find(this.run()).name, this.opened?.getTime()];
      },
    });
    const app = await start(Held);
    const held = app.get(Held);
    await expect(held.invoke()).resolves.toEqual(['user 1', 5]);
    expect(held.users).toBeInstanceOf(Users);
    await app.close();
  });

  test('keeps a getter or a setter of `properties` as one, with the instance as its `this`', async () => {
    const User = endpoint.query({
      path: 'this/getter',
      inject: { users: Users },
      methods: {
        nameOf(id: number) {
          return this.users.find(id).name;
        },
      },
      properties: () => ({
        id: 2,
        reads: 0,
        // Reads only properties: typed as it is.
        get double() {
          return this.id * 2;
        },
        // Reads a method.
        get name() {
          this.reads++;
          return this.nameOf(this.id);
        },
        set name(value: string) {
          this.id = value.length;
        },
      }),
      handler() {
        expectTypeOf<typeof this.double>().toEqualTypeOf<number>();
        expectTypeOf<typeof this.name>().toEqualTypeOf<string>();
        return [this.double, this.name];
      },
    });
    const app = await start(User);
    const user = app.get(User);
    await expect(user.invoke()).resolves.toEqual([4, 'user 2']);
    // Read when asked, and by nothing before the handler did.
    expect(user.reads).toBe(1);
    user.id = 3;
    expect(user.double).toBe(6);
    user.name = 'seven';
    expect(user.id).toBe(5);
    // As a class's accessors are: not among the instance's keys.
    expect(Object.keys(user)).toEqual(expect.not.arrayContaining(['double', 'name']));
    await app.close();
  });

  test('a property named `__proto__` is a property, and the instance stays one of its class', () => {
    const Named = endpoint.query({
      path: 'this/proto',
      properties: () => JSON.parse('{ "__proto__": { "n": 1 } }') as object,
      handler: () => null,
    });
    const named = new Named();
    expect(named).toBeInstanceOf(Named);
    expect(Object.getOwnPropertyDescriptor(named, '__proto__')?.value).toEqual({ n: 1 });
  });

  test('has the methods the endpoint declares, which have it too', async () => {
    const Pair = endpoint.query({
      path: 'this/methods',
      inject: { users: Users },
      properties: () => ({ found: 0 }),
      input: z.object({ id: z.number() }),
      methods: {
        find(id: number) {
          this.found++;
          // @ts-expect-error not a member
          void this.missing;
          return this.users.find(id);
        },
        twice(id: number) {
          if (id < 0) {
            // @ts-expect-error a number
            this.find('1');
          }
          return [this.find(id), this.find(id)];
        },
      },
      handler({ input }) {
        expectTypeOf<typeof this.twice>().toEqualTypeOf<
          (id: number) => { id: number; name: string }[]
        >();
        return { users: this.twice(input.id), found: this.found };
      },
    });
    const app = await start(Pair);
    const pair = app.get(Pair);
    await expect(pair.invoke({ input: { id: 3 } })).resolves.toEqual({
      users: [
        { id: 3, name: 'user 3' },
        { id: 3, name: 'user 3' },
      ],
      found: 2,
    });
    // As a controller's methods are: on the instance, for a test to call.
    expect(pair.find(4)).toEqual({ id: 4, name: 'user 4' });
    expect(pair.found).toBe(3);
    await app.close();
  });

  test('is typed with the methods declared above what returns from one', async () => {
    const Ordered = endpoint.query({
      path: 'this/order',
      inject: { users: Users },
      // TypeScript reads the options in order, and types the `this` of a function that
      // returns from it with what it has read by then.
      handler() {
        // @ts-expect-error `methods` comes after
        return this.find(1) as unknown;
      },
      methods: {
        find(id: number) {
          return this.users.find(id);
        },
      },
    });
    // A return type of its own lifts that: the function's body is then read last.
    endpoint.query({
      path: 'this/order-typed',
      inject: { users: Users },
      handler(): { id: number } {
        return this.find(1);
      },
      methods: {
        find(id: number) {
          return this.users.find(id);
        },
      },
    });
    // Only the types are behind: the method is there.
    const ordered = Object.assign(new Ordered(), { users: new Users() });
    await expect(ordered.invoke()).resolves.toEqual({ id: 1, name: 'user 1' });
  });

  test("is given to each lifecycle hook, which NestJS calls as it does a controller's", async () => {
    const Hooked = endpoint.query({
      path: 'this/hooks',
      inject: { clock: Clock },
      properties: () => ({ calls: [] as string[] }),
      methods: {
        note(hook: string, signal?: string) {
          this.calls.push(`${hook} at ${this.clock.now()}, signal ${signal}`);
        },
      },
      lifecycle: {
        onModuleInit() {
          this.note('init');
        },
        async onApplicationBootstrap() {
          await Promise.resolve();
          this.note('bootstrap');
        },
        onModuleDestroy() {
          this.note('destroy');
        },
        beforeApplicationShutdown(signal) {
          expectTypeOf(signal).toEqualTypeOf<string | undefined>();
          this.note('before shutdown', signal);
        },
        onApplicationShutdown(signal) {
          this.note('shutdown', signal);
        },
      },
      handler() {
        return this.calls;
      },
    });
    const app = await start(Hooked);
    const hooked = app.get(Hooked);
    expect(hooked.calls).toEqual([
      'init at 7, signal undefined',
      'bootstrap at 7, signal undefined',
    ]);
    await app.close();
    expect(hooked.calls.slice(2)).toEqual([
      'destroy at 7, signal undefined',
      'before shutdown at 7, signal undefined',
      'shutdown at 7, signal undefined',
    ]);
  });

  test('is given to a lifecycle hook, typed, with what the endpoint and its router inject', async () => {
    const router = createRouterEndpoint(routerFile, {
      inject: { clock: Clock },
    }) as EndpointBuilders<{ clock: typeof Clock }>;
    const seen: unknown[] = [];
    const Hooked = router.query({
      path: 'this/hook-types',
      inject: { users: Users },
      properties: () => ({ started: 0 }),
      methods: {
        nameOf(id: number) {
          return this.users.find(id).name;
        },
      },
      lifecycle: {
        onModuleInit() {
          expectTypeOf(this.users).toEqualTypeOf<Users>();
          expectTypeOf(this.clock).toEqualTypeOf<Clock>();
          expectTypeOf(this.started).toEqualTypeOf<number>();
          expectTypeOf<typeof this.nameOf>().toEqualTypeOf<(id: number) => string>();
          if (this.started > 0) {
            // @ts-expect-error not a member
            void this.missing;
            // @ts-expect-error a number
            this.nameOf('1');
          }
          this.started = this.clock.now();
          seen.push(this.nameOf(this.started), this.clock instanceof Clock);
        },
      },
      handler() {
        return this.started;
      },
    });
    const app = await start(Hooked);
    expect(seen).toEqual(['user 7', true]);
    await expect(app.get(Hooked).invoke()).resolves.toBe(7);
    await app.close();
  });

  describe('has one member of each name', () => {
    const declare = (options: object) => () =>
      endpoint.query({ path: 'this/names', handler: () => null, ...options } as any);

    test.each([
      ['the handler', { methods: { handler() {} } }, '`methods` declares `handler`'],
      ['invoke()', { methods: { invoke() {} } }, '`methods` declares `invoke`'],
      [
        'a lifecycle hook',
        { methods: { onModuleInit() {} } },
        '`methods` declares `onModuleInit`, a lifecycle hook',
      ],
      [
        'what is injected',
        { inject: { users: Users }, methods: { users() {} } },
        '`methods` declares `users`, which is injected',
      ],
    ])('a method is not named as %s', (_, options, message) => {
      expect(declare(options)).toThrow(message);
    });

    test.each([
      ['what is injected', { inject: { users: Users } }, 'users', 'which is injected'],
      ['a method', { methods: { find() {} } }, 'find', 'which `methods` declares'],
      ['the handler', {}, 'handler', 'a name the endpoint has'],
    ])('a property is not named as %s', (_, options, name, message) => {
      // Known when an instance is made: NestJS makes one as the app starts.
      const expected = `\`properties\` declares \`${name}\`, ${message}`;
      const Named = declare({ ...options, properties: () => ({ [name]: 1 }) })();
      expect(() => new Named()).toThrow(expected);
      const getter = () => Object.defineProperty({}, name, { get: () => 1, enumerable: true });
      const NamedGetter = declare({ ...options, properties: getter })();
      expect(() => new NamedGetter()).toThrow(expected);
    });

    test.each([
      ['a lifecycle hook', 'onModuleDestroy', 'a lifecycle hook'],
      ['the handler', 'handler', 'a name the endpoint has'],
      ['invoke()', 'invoke', 'a name the endpoint has'],
    ])('what is injected is not named as %s', (_, name, message) => {
      const expected = `\`inject\` declares \`${name}\`, ${message}: \`this\` has one member of each name.`;
      expect(declare({ inject: { [name]: Users } })).toThrow(expected);
      // By its router too.
      const router = createRouterEndpoint(routerFile, { inject: { [name]: Users } });
      expect(() => router.query({ path: 'this/router-names', handler: () => null })).toThrow(
        expected,
      );
    });

    test('which the types tell of what is injected', () => {
      class Clock {}
      const define = () =>
        endpoint.query({
          path: 'this/typed-inject',
          inject: {
            // @ts-expect-error a lifecycle hook
            onModuleInit: Clock,
            // @ts-expect-error the endpoint's own
            invoke: Clock,
            clock: Clock,
          },
          handler: () => null,
        });
      expect(define).toThrow('`inject` declares `onModuleInit`');
      const router = createRouterEndpoint(routerFile, {}) as EndpointBuilders<{
        clock: typeof Clock;
      }>;
      expect(() =>
        router.query({
          path: 'this/typed-inject-router',
          // @ts-expect-error the endpoint's own
          inject: { handler: Clock },
          handler: () => null,
        }),
      ).toThrow('`inject` declares `handler`');
    });

    test('which the types tell too', () => {
      expect(() =>
        endpoint.query({
          path: 'this/typed-names',
          inject: { users: Users },
          // @ts-expect-error `find` is a method
          properties: () => ({ find: 1, found: 0 }),
          methods: {
            // @ts-expect-error injected
            users() {},
            // @ts-expect-error a lifecycle hook
            onModuleInit() {},
            find() {
              return 1;
            },
          },
          handler: () => null,
        }),
      ).toThrow('`methods` declares `users`');
    });

    test('which the types tell of each property', () => {
      const Named = endpoint.query({
        path: 'this/typed-own-names',
        // @ts-expect-error `invoke` is the endpoint's own
        properties: () => ({ invoke: 1 }),
        handler: () => null,
      });
      expect(() => new Named()).toThrow('`properties` declares `invoke`');
    });

    test.each([
      [
        'methods that are not functions',
        { methods: { find: 1 } },
        '`methods.find` must be a function',
      ],
      ['properties given as an object', { properties: {} }, '`properties` must be a function'],
      [
        'a hook that is not a function',
        {
          lifecycle: {
            onModuleInit: 1,
          },
        },
        '`lifecycle.onModuleInit` must be a function',
      ],
    ])('refuses %s', (_, options, message) => {
      expect(declare(options)).toThrow(message);
    });

    test('refuses properties that are not an object, when an instance is made', () => {
      const None = declare({ properties: () => 1 })();
      expect(() => new None()).toThrow('`properties` must return an object');
    });
  });
});

test('an option it does not know, and a hook it does not know in `lifecycle`, are type errors', () => {
  endpoint.query({
    path: 'keys/unknown-option',
    // @ts-expect-error not an option
    unknownOption: 1,
    handler: () => null,
  });
  // A hook is also refused at runtime, as its types cannot catch it in an object made elsewhere.
  expect(() =>
    endpoint.mutation({
      path: 'keys/unknown-hook',
      lifecycle: {
        // @ts-expect-error not a lifecycle hook
        onModuleInt() {},
      },
      handler: () => null,
    }),
  ).toThrow('`lifecycle.onModuleInt` is not a lifecycle hook');
});

describe('what invoke() takes', () => {
  const none = endpoint.query({ path: 'invoke/none', handler: () => null });
  const input = endpoint.mutation({
    path: 'invoke/input',
    input: z.object({ id: z.number() }),
    handler: ({ input: { id } }) => id,
  });
  const params = endpoint.query({
    path: 'invoke/:id',
    params: z.object({ id: z.coerce.number() }),
    handler: ({ params: { id } }) => id,
  });
  const optionalQuery = endpoint.query({
    path: 'invoke/query',
    method: 'get',
    query: z.object({ q: z.string().optional() }),
    handler: ({ query }) => query.q ?? null,
  });
  const requiredQuery = endpoint.query({
    path: 'invoke/required-query',
    method: 'get',
    query: z.object({ q: z.string() }),
    handler: ({ query }) => query.q,
  });
  const all = endpoint.mutation({
    path: 'invoke/all/:id',
    params: z.object({ id: z.coerce.number() }),
    query: z.object({ q: z.string().optional() }),
    input: z.object({ name: z.string() }),
    handler: ({ params: { id }, query, input: { name } }) => [name, id, query.q ?? null],
  });

  test('nothing, for an endpoint that declares nothing', async () => {
    await expect(new none().invoke()).resolves.toBeNull();
    await expect(new none().invoke({})).resolves.toBeNull();
    // @ts-expect-error a key the endpoint does not declare
    void (() => new none().invoke({ input: {} }));
  });

  test('the raw input, under `input`', async () => {
    await expect(new input().invoke({ input: { id: 1 } })).resolves.toBe(1);
    // @ts-expect-error of the type the schema reads
    void (() => new input().invoke({ input: { id: '1' } }));
  });

  test('the path params, under `params`, as the strings a URL has', async () => {
    await expect(new params().invoke({ params: { id: '7' } })).resolves.toBe(7);
  });

  test('the search params, under `query`', async () => {
    await expect(new optionalQuery().invoke()).resolves.toBeNull();
    await expect(new optionalQuery().invoke({ query: { q: 'a' } })).resolves.toBe('a');
    await expect(new requiredQuery().invoke({ query: { q: 'b' } })).resolves.toBe('b');
  });

  test('all three in one object, as the endpoint names them', async () => {
    await expect(new all().invoke({ params: { id: '3' }, input: { name: 'n' } })).resolves.toEqual([
      'n',
      3,
      null,
    ]);
    await expect(
      new all().invoke({ params: { id: '3' }, query: { q: 'x' }, input: { name: 'n' } }),
    ).resolves.toEqual(['n', 3, 'x']);
  });

  test('any of them left out, which validation refuses when its schema requires it', async () => {
    await expect(new input().invoke()).rejects.toThrow(ZodValidationException);
    await expect(new params().invoke()).rejects.toThrow(ZodValidationException);
    await expect(new params().invoke({ params: {} } as never)).rejects.toThrow(
      ZodValidationException,
    );
    await expect(new requiredQuery().invoke({})).rejects.toThrow(ZodValidationException);
    await expect(new all().invoke({ input: { name: 'n' } })).rejects.toThrow(
      ZodValidationException,
    );
  });

  test('params and search params that all have a default, or none of them required, to leave out', async () => {
    const defaulted = endpoint.query({
      path: 'invoke/defaulted/:page',
      method: 'get',
      params: z.object({ page: z.coerce.number().default(1) }),
      query: z.object({ size: z.coerce.number().default(10), q: z.string().optional() }),
      handler: ({ params, query }) => [params.page, query.size, query.q ?? null],
    });
    await expect(new defaulted().invoke()).resolves.toEqual([1, 10, null]);
    await expect(new defaulted().invoke({ params: { page: '3' } })).resolves.toEqual([3, 10, null]);
    const mixed = endpoint.query({
      path: 'invoke/mixed/:page',
      method: 'get',
      params: z.object({ page: z.coerce.number().default(1) }),
      query: z.object({ q: z.string() }),
      handler: ({ params, query }) => [params.page, query.q],
    });
    await expect(new mixed().invoke({ query: { q: 'a' } })).resolves.toEqual([1, 'a']);
  });

  test('fails a request that fails a schema, as a request over HTTP does', async () => {
    await expect(new params().invoke({ params: { id: 'seven' } })).rejects.toThrow(
      ZodValidationException,
    );
    await expect(new input().invoke({ input: { id: 'one' } } as never)).rejects.toThrow(
      ZodValidationException,
    );
  });
});
