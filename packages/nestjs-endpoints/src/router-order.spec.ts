import path from 'node:path';
import type { CanActivate, DynamicModule, INestApplicationContext, Type } from '@nestjs/common';
import { GUARDS_METADATA, INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { hooks, log, RootGuard } from '../test/fixtures/routing/order/log';
import { fixtures, pathOf, start } from '../test/routing';
import { EndpointRouter, endpointsUnder } from './endpoint-router';
import { NestjsEndpoints } from './nestjs-endpoints';

/** The names of what a class has under a class metadata key of NestJS, in order. */
const named = (key: string, target: object) =>
  ((Reflect.getMetadata(key, target) as { name: string }[] | undefined) ?? []).map((g) => g.name);

/** Every endpoint under a router, by its path. */
async function endpointsOf(router: Promise<DynamicModule>) {
  return Object.fromEntries(endpointsUnder(await router).map((cls) => [pathOf(cls), cls]));
}

// `order/` is a tree of routers the root finds: `outer` and, under it, `inner` and `plain`
// are made with `create()`; `inner/kid` with `child()`; `plain` declares no hook, and has
// `leaf` under it, which does.
describe('a tree of routers the root router of an app finds', () => {
  const root = NestjsEndpoints.forRoot({
    router: { rootDirectory: path.join(fixtures, 'order'), guards: [RootGuard], ...hooks('root') },
  });
  let app: INestApplicationContext;
  let closed: Promise<void> | undefined;
  beforeAll(async () => {
    app = await start(root);
  });

  /** Each one above, and what is under it: a router, or one of its own endpoints. */
  const under = [
    ['root', 'outer', 'a router it finds'],
    ['outer', 'inner', 'a router made with create() under one made with create()'],
    ['inner', 'kid', 'a router made with child() under one made with create()'],
    ['outer', 'leaf', 'a router under one between them that declares no hook'],
    ['outer', 'outer endpoint', 'its own endpoint, with routers under it'],
    ['inner', 'inner endpoint', 'its own endpoint, with a child under it'],
    ['leaf', 'leaf endpoint', 'its own endpoint, with no router under it'],
  ] as const;

  test.each(under)('%s starts before %s: %s', (above, below) => {
    expect(log).toContain(`${above} init`);
    expect(log.indexOf(`${above} init`)).toBeLessThan(log.indexOf(`${below} init`));
  });

  test('each starts once', () => {
    const starts = log.filter((entry) => entry.endsWith(' init'));
    expect(starts.toSorted()).toEqual([...new Set(starts)].toSorted());
    expect(starts).toHaveLength(8);
  });

  test.each([
    ['outer/list', ['RootGuard', 'OuterGuard']],
    ['outer/inner/view', ['RootGuard', 'OuterGuard', 'InnerGuard']],
    ['outer/inner/kid/list', ['RootGuard', 'OuterGuard', 'InnerGuard', 'KidGuard']],
    ['outer/plain/leaf/list', ['RootGuard', 'OuterGuard']],
  ])(
    'the endpoint %s has the guards of the routers above it, the outermost first',
    async (at, guards) => {
      const endpoints = await endpointsOf(root);
      expect(named(GUARDS_METADATA, endpoints[at]!)).toEqual(guards);
    },
  );

  test("an endpoint with a path parameter has the guard that refuses a name beside it first, before its routers'", async () => {
    const endpoints = await endpointsOf(root);
    expect(named(GUARDS_METADATA, endpoints['outer/inner/kid/:item']!)).toEqual([
      'NamesBesideGuard',
      'RootGuard',
      'OuterGuard',
      'InnerGuard',
      'KidGuard',
    ]);
  });

  test.each([
    ['outer/list', ['OuterInterceptor']],
    ['outer/inner/view', ['OuterInterceptor']],
    ['outer/inner/kid/list', ['OuterInterceptor', 'KidInterceptor']],
  ])('the endpoint %s has their interceptors, the outermost first', async (at, interceptors) => {
    const endpoints = await endpointsOf(root);
    expect(named(INTERCEPTORS_METADATA, endpoints[at]!)).toEqual(interceptors);
  });

  test("an endpoint's own guard stays its handler's, after its routers'", async () => {
    const view = (await endpointsOf(root))['outer/inner/view']!;
    expect(named(GUARDS_METADATA, (view.prototype as { handler: object }).handler)).toEqual([
      'MethodGuard',
    ]);
  });

  test.each(under)('%s stops after %s: %s', async (above, below) => {
    // Closed by the first of these tests to run.
    await (closed ??= app.close());
    expect(log).toContain(`${above} destroy`);
    expect(log.indexOf(`${below} destroy`)).toBeLessThan(log.indexOf(`${above} destroy`));
  });
});

describe('routers made with child(), each loaded by an app as itself', () => {
  const guard = (name: string) => {
    class Guard implements CanActivate {
      canActivate() {
        return true;
      }
    }
    Object.defineProperty(Guard, 'name', { value: name });
    return Guard;
  };

  /** Notes `name` as it starts and stops, in `calls`. */
  const noting = (calls: string[], name: string) => ({
    lifecycle: {
      onModuleInit: () => void calls.push(`${name} init`),
      onModuleDestroy: () => void calls.push(`${name} destroy`),
    },
  });

  test('a router with no hook between two that have one leaves them in order', async () => {
    const calls: string[] = [];
    const top = EndpointRouter.create({ endpoints: [], ...noting(calls, 'top') });
    const middle = top.child({ endpoints: [] });
    const bottom = middle.child({ endpoints: [], ...noting(calls, 'bottom') });
    const app = await start(NestjsEndpoints.forRoot(), bottom, middle, top);
    await app.close();
    expect(calls).toEqual(['top init', 'bottom init', 'bottom destroy', 'top destroy']);
  });

  test('two children without their parent: the parent starts once, before both, and stops after', async () => {
    const calls: string[] = [];
    const parent = EndpointRouter.create({ endpoints: [], ...noting(calls, 'parent') });
    const one = parent.child({ endpoints: [], ...noting(calls, 'one') });
    const other = parent.child({ endpoints: [], ...noting(calls, 'other') });
    const app = await start(NestjsEndpoints.forRoot(), one, other);
    await app.close();
    expect(calls.filter((call) => call.startsWith('parent'))).toEqual([
      'parent init',
      'parent destroy',
    ]);
    expect(calls[0]).toBe('parent init');
    expect(calls.at(-1)).toBe('parent destroy');
    expect(calls.toSorted()).toEqual(
      ['one', 'other', 'parent'].flatMap((name) => [`${name} destroy`, `${name} init`]),
    );
  });

  test('a router starts after its providers, and stops before them', async () => {
    const calls: string[] = [];
    class Connection {
      onModuleInit() {
        calls.push('provider init');
      }

      onModuleDestroy() {
        calls.push('provider destroy');
      }
    }
    const router = EndpointRouter.create({
      endpoints: [],
      providers: [Connection],
      context: {
        inject: { connection: Connection },
      },
      ...noting(calls, 'router'),
    });
    const app = await start(router);
    await app.close();
    expect(calls).toEqual(['provider init', 'router init', 'router destroy', 'provider destroy']);
  });

  test('a router starts before its own endpoint, and stops after it', async () => {
    const calls: string[] = [];
    const router = EndpointRouter.create({
      endpoints: (): Type[] => [Listed],
      ...noting(calls, 'router'),
    });
    const Listed = router.endpoint.query({
      path: `order-${Math.random()}`,
      ...noting(calls, 'endpoint'),
      handler: () => null,
    });
    const app = await start(router);
    await app.close();
    expect(calls).toEqual(['router init', 'endpoint init', 'endpoint destroy', 'router destroy']);
  });

  test('a child gives its endpoints the guards of its lineage itself, once, whether or not its parents register', async () => {
    const [Top, Middle, Bottom] = [guard('Top'), guard('Middle'), guard('Bottom')];
    const top = EndpointRouter.create({ endpoints: (): Type[] => [OfTop], guards: [Top] });
    const middle = top.child({ endpoints: [], guards: [Middle] });
    const bottom = middle.child({ endpoints: (): Type[] => [OfBottom], guards: [Bottom] });
    const OfTop = top.endpoint.query({ path: `top-${Math.random()}`, handler: () => null });
    const OfBottom = bottom.endpoint.query({
      path: `bottom-${Math.random()}`,
      handler: () => null,
    });
    // By itself first: no router above it has registered.
    await bottom;
    expect(named(GUARDS_METADATA, OfBottom)).toEqual(['Top', 'Middle', 'Bottom']);
    await middle;
    await top;
    expect(named(GUARDS_METADATA, OfBottom)).toEqual(['Top', 'Middle', 'Bottom']);
    expect(named(GUARDS_METADATA, OfTop)).toEqual(['Top']);
  });
});
