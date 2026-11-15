import z from 'zod';
import { createRouterEndpoint, decorated, endpoint, type EndpointBuilders } from './endpoint-fn.js';
import { ZodValidationException } from './exceptions.js';
import { loneValuesAsArrays } from './object-parameters.js';

// The reader `loneValuesAsArrays` decides on is wrapped, to count the
// decisions and the requests the reader reads.
vi.mock('./object-parameters.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./object-parameters.js')>();
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
  test('are the package builders when the router injects nothing', () => {
    expect(createRouterEndpoint(routerFile, undefined, undefined)).toBe(endpoint);
    expect(createRouterEndpoint(routerFile, {}, {})).toBe(endpoint);
  });

  test('reject a key the router injects, given under a deprecated name too', () => {
    // Typed as the router's own `endpoint` is, so the error is the key's.
    const router = createRouterEndpoint(routerFile, undefined, {
      user: decorated(() => {}),
    }) as EndpointBuilders<undefined, { user: ReturnType<typeof decorated> }>;
    expect(() =>
      router.query({
        // @ts-expect-error `user` is injected by the router
        injectMethod: { user: decorated(() => {}) },
        handler: () => null,
      }),
    ).toThrow(/endpoint-fn\.spec[\s\S]*`user` is already injected/);
  });

  test('are checked against the router that sets the endpoint up', () => {
    const router = createRouterEndpoint(routerFile, { service: Service }, undefined);
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
