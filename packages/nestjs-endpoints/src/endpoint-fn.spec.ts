import { createRouterEndpoint, decorated, endpoint, type EndpointBuilders } from './endpoint-fn.js';

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
