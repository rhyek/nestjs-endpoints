import {
  type CallHandler,
  type CanActivate,
  type ExecutionContext,
  Headers,
  Injectable,
  Module,
  type NestInterceptor,
  Req,
  Scope,
  type Type,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  PROPERTY_DEPS_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { z } from 'zod';
import { empty, pathOf, start } from '../test/routing';
import { tagDescriptions } from './codegen/hash';
import { descriptorOf } from './descriptors';
import { EndpointRouter, type EndpointRouterOptions, endpointsUnder } from './endpoint-router';
import { decorated } from './injections';
import { NestjsEndpoints } from './nestjs-endpoints';

// A router an app does not find in its folders, as one a library of its monorepo exports, is
// nested under the router that lists it in `routers`, and has what that router gives.

@Injectable()
class Clock {
  now() {
    return 42;
  }
}

@Injectable()
class OtherClock extends Clock {}

@Injectable()
class AboveGuard implements CanActivate {
  canActivate() {
    return true;
  }
}

@Injectable()
class LibraryGuard implements CanActivate {
  canActivate() {
    return true;
  }
}

/** The names of the guards on an endpoint's class, in the order they run. */
const guardsOf = (cls: Type) =>
  ((Reflect.getMetadata(GUARDS_METADATA, cls) as { name: string }[] | undefined) ?? []).map(
    (guard) => guard.name,
  );

type LibraryOptions = EndpointRouterOptions<any, any, any>;

/** A router as a library exports one, with an endpoint its own file defines. */
function library(options: LibraryOptions = {}) {
  const router = EndpointRouter.create({
    rootDirectory: empty,
    basePath: 'shared',
    namespace: 'shared',
    endpoints: (): Type[] => [ping],
    ...options,
  });
  // The names its handler is given, and what it is given as `clock`.
  const ping = router.endpoint.query({
    path: 'ping',
    handler: (given: object) => ({
      given: Object.keys(given).sort(),
      now: (given as { clock?: Clock }).clock?.now(),
    }),
  });
  return { router, ping };
}

describe('a router another lists in `routers`', () => {
  test('is under its base path and in its namespace', async () => {
    const { router, ping } = library();
    const above = await EndpointRouter.create({
      rootDirectory: empty,
      basePath: 'api',
      namespace: 'api',
      routers: [router],
    });
    expect(pathOf(ping)).toBe('/api/shared/ping');
    expect(descriptorOf(ping)?.namespaceChain).toEqual(['api', 'shared']);
    expect(endpointsUnder(above)).toEqual([ping]);
  });

  test('is at the base path it is registered with, in place of its own', async () => {
    const { router, ping } = library();
    await EndpointRouter.create({
      rootDirectory: empty,
      basePath: 'api',
      routers: [router.register({ basePath: 'v1/common' })],
    });
    expect(pathOf(ping)).toBe('/api/v1/common/ping');
  });

  test('with no base path of its own, is at that of the router that lists it', async () => {
    const { router, ping } = library({ basePath: undefined });
    await EndpointRouter.create({ rootDirectory: empty, basePath: 'api', routers: [router] });
    expect(pathOf(ping)).toBe('/api/ping');
  });

  test('has the guards of the router that lists it, before its own', async () => {
    const { router, ping } = library({ guards: [LibraryGuard] });
    await EndpointRouter.create({ rootDirectory: empty, guards: [AboveGuard], routers: [router] });
    expect(guardsOf(ping)).toEqual(['AboveGuard', 'LibraryGuard']);
  });

  test('resolves what the router that lists it provides', async () => {
    const { router, ping } = library({ context: { inject: { clock: Clock } } });
    const app = await start(
      EndpointRouter.create({ rootDirectory: empty, providers: [Clock], routers: [router] }),
    );
    expect(await app.get(ping, { strict: false }).invoke()).toEqual({
      given: ['clock', 'response', 'schemas'],
      now: 42,
    });
  });

  test('gives its endpoints the context of the router that lists it', async () => {
    const { router, ping } = library();
    const app = await start(
      EndpointRouter.create({
        rootDirectory: empty,
        providers: [Clock],
        context: { inject: { clock: Clock } },
        routers: [router],
      }),
    );
    expect(await app.get(ping, { strict: false }).invoke()).toEqual({
      given: ['clock', 'response', 'schemas'],
      now: 42,
    });
  });

  test('keeps what its own context declares under a name both have', async () => {
    @Injectable()
    class Late extends OtherClock {
      override now() {
        return 7;
      }
    }
    const { router, ping } = library({ context: { inject: { clock: Late } }, providers: [Late] });
    const app = await start(
      EndpointRouter.create({
        rootDirectory: empty,
        providers: [Clock],
        context: { inject: { clock: Clock } },
        routers: [router],
      }),
    );
    expect(await app.get(ping, { strict: false }).invoke()).toMatchObject({ now: 7 });
  });

  test('has NestJS inject each name once, whichever router gives it', async () => {
    const { router, ping } = library({
      context: {
        inject: { clock: Clock },
        injectOnRequest: { request: decorated(Req()) },
      },
    });
    // Set up where it is defined, with its router's own context, then again as that router
    // loads under the one that lists it.
    const injected = () =>
      (Reflect.getMetadata(PROPERTY_DEPS_METADATA, ping) as { key: string }[]).map((d) => d.key);
    const onRequest = () =>
      Object.keys(Reflect.getMetadata(ROUTE_ARGS_METADATA, ping, 'handler') as object).length;
    expect([injected(), onRequest()]).toEqual([['clock'], 2]);
    await EndpointRouter.create({
      rootDirectory: empty,
      providers: [Clock, OtherClock],
      context: {
        inject: { other: OtherClock },
        injectOnRequest: { headers: decorated(Headers()) },
      },
      routers: [router],
    });
    expect([injected().sort(), onRequest()]).toEqual([['clock', 'other'], 3]);
  });

  test('gives it to the endpoints its folder holds, as to those its file defines', async () => {
    const found = (await import('../test/fixtures/routing/library/router')).default;
    const app = await start(
      NestjsEndpoints.forRoot({
        router: {
          rootDirectory: empty,
          basePath: 'api',
          namespace: 'api',
          providers: [Clock],
          context: { inject: { clock: Clock } },
          guards: [AboveGuard],
          routers: [found],
        },
      }),
    );
    // Its own endpoint, and that of the router it makes with `child()` in a folder under it.
    const under = Object.fromEntries(endpointsUnder(await found).map((cls) => [pathOf(cls), cls]));
    expect(Object.keys(under).sort()).toEqual(['api/library/inner/view', 'api/library/list']);
    expect(descriptorOf(under['api/library/list']!)?.namespaceChain).toEqual(['api', 'library']);
    expect(descriptorOf(under['api/library/inner/view']!)?.namespaceChain).toEqual([
      'api',
      'library',
      'inner',
    ]);
    for (const cls of Object.values(under)) {
      expect(guardsOf(cls)).toEqual(['AboveGuard']);
      expect(await app.get(cls, { strict: false }).invoke()).toEqual([
        'clock',
        'response',
        'schemas',
      ]);
    }
  });

  test('gives a router made with its child() the guards above it, wherever an app loads that one', async () => {
    const { router } = library({ guards: [LibraryGuard] });
    // Not in a folder of its parent's, nor listed: an app imports it beside the router above.
    const kid = router.child({ rootDirectory: empty, endpoints: (): Type[] => [view] });
    const view = kid.endpoint.query({ path: 'kid/view', handler: () => null });
    const above = EndpointRouter.create({
      rootDirectory: empty,
      basePath: 'api',
      guards: [AboveGuard],
      routers: [router],
    });
    await start(above, kid);
    expect(pathOf(view)).toBe('/api/shared/kid/view');
    expect(guardsOf(view)).toEqual(['AboveGuard', 'LibraryGuard']);
  });

  test('is not one made with child(): that one is under its parent', () => {
    const { router } = library();
    const kid = router.child({ rootDirectory: empty, endpoints: [] });
    expect(() => EndpointRouter.create({ rootDirectory: empty, routers: [kid] })).toThrow(
      /router-routers\.spec\.ts lists the router of .*router-routers\.spec\.ts in `routers`, which is made with the child\(\) of .*router-routers\.spec\.ts: it is under that router\./,
    );
  });

  test('lists routers of its own, each under it and given what is above both', async () => {
    const { router: inner, ping } = library({ basePath: 'inner', namespace: 'inner' });
    const middle = EndpointRouter.create({
      rootDirectory: empty,
      basePath: 'middle',
      namespace: 'middle',
      guards: [LibraryGuard],
      routers: [inner],
    });
    const app = await start(
      EndpointRouter.create({
        rootDirectory: empty,
        basePath: 'api',
        providers: [Clock],
        context: { inject: { clock: Clock } },
        guards: [AboveGuard],
        routers: [middle],
      }),
    );
    expect(pathOf(ping)).toBe('/api/middle/inner/ping');
    expect(descriptorOf(ping)?.namespaceChain).toEqual(['middle', 'inner']);
    expect(guardsOf(ping)).toEqual(['AboveGuard', 'LibraryGuard']);
    expect(await app.get(ping, { strict: false }).invoke()).toMatchObject({ now: 42 });
  });

  test('has the path parameters of the router that lists it, validated', async () => {
    const { router, ping } = library({ endpoints: (): Type[] => [ping, where] });
    const where = router.endpoint.query({
      path: 'where',
      handler: (given: object) => (given as { params?: unknown }).params,
    });
    const app = await start(
      EndpointRouter.create({
        rootDirectory: empty,
        basePath: 'clinics/:clinicId',
        context: { params: z.object({ clinicId: z.coerce.number() }) },
        routers: [router],
      }),
    );
    expect(pathOf(where)).toBe('/clinics/:clinicId/shared/where');
    expect(descriptorOf(where)?.pathParams).toEqual([
      { name: 'clinicId', schema: { type: 'number' } },
    ]);
    const mounted = app.get(where, { strict: false });
    expect(await mounted.invoke({ params: { clinicId: '7' } })).toEqual({ clinicId: 7 });
    await expect(mounted.invoke({ params: { clinicId: 'seven' } })).rejects.toThrow(
      'Validation failed',
    );
  });

  test('resolves what the router that lists it imports', async () => {
    @Module({ providers: [Clock], exports: [Clock] })
    class ClockModule {}
    const { router, ping } = library({ context: { inject: { clock: Clock } } });
    const app = await start(
      EndpointRouter.create({ rootDirectory: empty, imports: [ClockModule], routers: [router] }),
    );
    expect(await app.get(ping, { strict: false }).invoke()).toMatchObject({ now: 42 });
  });

  test('has the interceptors of the router that lists it, before its own', async () => {
    @Injectable()
    class AboveInterceptor implements NestInterceptor {
      intercept(_: ExecutionContext, next: CallHandler) {
        return next.handle();
      }
    }
    @Injectable()
    class LibraryInterceptor extends AboveInterceptor {}
    const { router, ping } = library({ interceptors: [LibraryInterceptor] });
    await EndpointRouter.create({
      rootDirectory: empty,
      interceptors: [AboveInterceptor],
      routers: [router],
    });
    expect(
      (Reflect.getMetadata(INTERCEPTORS_METADATA, ping) as { name: string }[]).map((i) => i.name),
    ).toEqual(['AboveInterceptor', 'LibraryInterceptor']);
  });

  test('starts after the router that lists it, and its endpoints after it', async () => {
    const started: string[] = [];
    const hook = (name: string) => ({
      lifecycle: {
        onModuleInit() {
          started.push(name);
        },
      },
    });
    const router = EndpointRouter.create({
      rootDirectory: empty,
      basePath: 'shared',
      endpoints: (): Type[] => [hooked],
      ...hook('library'),
    });
    const hooked = router.endpoint.query({
      path: 'hooked',
      ...hook('endpoint'),
      handler: () => null,
    });
    await start(
      EndpointRouter.create({ rootDirectory: empty, routers: [router], ...hook('above') }),
    );
    expect(started).toEqual(['above', 'library', 'endpoint']);
  });

  test('fails an app for a lifecycle hook on an endpoint the listing router makes per request', async () => {
    @Injectable({ scope: Scope.REQUEST })
    class PerRequest {}
    const router = EndpointRouter.create({
      rootDirectory: empty,
      basePath: 'shared',
      endpoints: (): Type[] => [hooked],
    });
    // Nothing of its own is per request: what the listing router gives it is.
    const hooked = router.endpoint.query({
      path: 'hooked-per-request',
      lifecycle: { onModuleInit() {} },
      handler: () => null,
    });
    await expect(
      start(
        EndpointRouter.create({
          rootDirectory: empty,
          providers: [PerRequest],
          context: { inject: { perRequest: PerRequest } },
          routers: [router],
        }),
      ),
    ).rejects.toThrow(
      /the endpoint of .*router-routers\.spec\.ts declares onModuleInit, but NestJS makes it for each request/,
    );
  });

  test("has its description on its namespace, under the listing router's", async () => {
    const { router } = library({ namespace: 'shared', description: 'What the apps share' });
    await EndpointRouter.create({
      rootDirectory: empty,
      namespace: 'api',
      routers: [router],
    });
    expect(tagDescriptions().get('api/shared')).toBe('What the apps share');
  });

  test.each([
    ['nothing', {}, '/api/shared/ping'],
    ['an empty base path', { basePath: '' }, '/api/ping'],
    ['a base path with slashes around it', { basePath: '/v2/common/' }, '/api/v2/common/ping'],
  ])('registered with %s, is under the router that lists it', async (_, listing, path) => {
    const { router, ping } = library();
    await EndpointRouter.create({
      rootDirectory: empty,
      basePath: '/api/',
      routers: [router.register(listing)],
    });
    expect(pathOf(ping)).toBe(path);
  });

  test('is at the root with the router that lists it, when neither has a base path', async () => {
    const { router, ping } = library({ basePath: undefined });
    await EndpointRouter.create({ rootDirectory: empty, routers: [router] });
    expect(pathOf(ping)).toBe('/ping');
  });

  test('is not a router of the app in its own right: an app with one root has one', async () => {
    const { router } = library();
    const { router: another } = library({ basePath: 'another' });
    // Two routers with no root fail an app; the two listed are under the one that lists them.
    await expect(
      start(EndpointRouter.create({ rootDirectory: empty, routers: [router, another] })),
    ).resolves.toBeDefined();
  });

  test('is listed once by a router too: twice in one `routers` fails', () => {
    const { router } = library();
    expect(() =>
      EndpointRouter.create({
        rootDirectory: empty,
        routers: [router, router.register({ basePath: 'again' })],
      }),
    ).toThrow(/lists the router of .* in `routers`, which .* lists already/);
  });

  test('alone, has only its own: nothing gave it more', async () => {
    const { router, ping } = library();
    const app = await start(router);
    expect(pathOf(ping)).toBe('/shared/ping');
    expect(await app.get(ping, { strict: false }).invoke()).toEqual({
      given: ['response', 'schemas'],
      now: undefined,
    });
  });

  test('is listed by one router: a second that lists it fails, naming both', () => {
    const { router } = library();
    // Listed as the router that lists it is made, not as it loads.
    void EndpointRouter.create({ rootDirectory: empty, routers: [router] });
    expect(() => EndpointRouter.create({ rootDirectory: empty, routers: [router] })).toThrow(
      /router-routers\.spec\.ts lists the router of .*router-routers\.spec\.ts in `routers`, which .*router-routers\.spec\.ts lists already/,
    );
  });

  test('is listed before it loads: one an app has loaded fails, naming it', async () => {
    const { router } = library();
    await router;
    expect(() => EndpointRouter.create({ rootDirectory: empty, routers: [router] })).toThrow(
      /router-routers\.spec\.ts lists the router of .*router-routers\.spec\.ts in `routers`, which has loaded already: where it is, and what its endpoints are given, are settled as it loads\./,
    );
  });

  test('is a router: anything else listed fails, naming what lists it', () => {
    expect(() =>
      EndpointRouter.create({ rootDirectory: empty, routers: [class NotARouter {} as never] }),
    ).toThrow(/router-routers\.spec\.ts: `routers` lists NotARouter, which is not a router/);
  });
});

describe('a router that expects names from the router that lists it', () => {
  interface Db {
    query(sql: string): string[];
  }
  interface AppUser {
    id: string;
  }

  @Injectable()
  class PgDb implements Db {
    query(sql: string) {
      return [sql];
    }
  }

  /** A library's router: it names what it is given, and the app says how. */
  function expecting() {
    const router = EndpointRouter.create({
      rootDirectory: empty,
      basePath: 'shared',
      expects: { db: EndpointRouter.given<Db>(), user: EndpointRouter.given<AppUser>() },
      endpoints: (): Type[] => [rows],
    });
    const rows = router.endpoint.query({
      path: 'rows',
      handler: ({ db, user }) => {
        expectTypeOf(db).toEqualTypeOf<Db>();
        expectTypeOf(user).toEqualTypeOf<AppUser>();
        return db.query('select 1');
      },
    });
    return { router, rows };
  }

  test('types them in its handlers, and is given them by that router', async () => {
    const { router, rows } = expecting();
    const app = await start(
      EndpointRouter.create({
        rootDirectory: empty,
        providers: [PgDb],
        context: { inject: { db: PgDb, user: PgDb } },
        routers: [router],
      }),
    );
    expect(await app.get(rows, { strict: false }).invoke()).toEqual(['select 1']);
  });

  test('fails as it loads when the router that lists it gives it none of one', async () => {
    const { router } = expecting();
    await expect(
      EndpointRouter.create({
        rootDirectory: empty,
        providers: [PgDb],
        context: { inject: { db: PgDb } },
        routers: [router],
      }),
    ).rejects.toThrow(
      /EndpointRouter\.create\(\) in .*router-routers\.spec\.ts: `expects` names `user`, which .*router-routers\.spec\.ts, the router that lists it in `routers`, does not give its endpoints\. Add `user` to the `context` of that router\./,
    );
  });

  test('fails as it loads when no router lists it', async () => {
    const { router } = expecting();
    await expect(router).rejects.toThrow(
      /`expects` names `db` and `user`, and no router lists it in `routers`: an app lists it in the `routers` of a router whose `context` gives them\./,
    );
  });

  test('types a name its own context declares too as its own context does', () => {
    const router = EndpointRouter.create({
      rootDirectory: empty,
      expects: { db: EndpointRouter.given<Db>(), user: EndpointRouter.given<AppUser>() },
      context: { inject: { db: PgDb } },
      endpoints: [],
    });
    router.endpoint.query({
      path: 'typed',
      handler: ({ db, user }) => {
        expectTypeOf(db).toEqualTypeOf<PgDb>();
        expectTypeOf(user).toEqualTypeOf<AppUser>();
        return null;
      },
    });
  });

  test('without it, a handler has no name its router does not declare', () => {
    const router = EndpointRouter.create({
      rootDirectory: empty,
      context: { inject: { clock: Clock } },
      endpoints: [],
    });
    router.endpoint.query({
      path: 'untyped',
      handler: (given) => {
        expectTypeOf(given).toHaveProperty('clock');
        expectTypeOf(given).not.toHaveProperty('db');
        return null;
      },
    });
  });

  test('passes what it expects on to a router made with its child()', () => {
    const router = EndpointRouter.create({
      rootDirectory: empty,
      expects: { db: EndpointRouter.given<Db>() },
      endpoints: [],
    });
    router.child({ rootDirectory: empty, endpoints: [] }).endpoint.query({
      path: 'child-typed',
      handler: ({ db }) => {
        expectTypeOf(db).toEqualTypeOf<Db>();
        return null;
      },
    });
  });

  test('is satisfied by a name its own context declares', async () => {
    const router = EndpointRouter.create({
      rootDirectory: empty,
      expects: { db: EndpointRouter.given<Db>() },
      context: { inject: { db: PgDb } },
      providers: [PgDb],
      endpoints: [],
    });
    await expect(router).resolves.toBeDefined();
  });
});
