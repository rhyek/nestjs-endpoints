import {
  type DynamicModule,
  type INestApplicationContext,
  Logger,
  type MiddlewareConsumer,
  type NestModule,
  RequestMethod,
  VERSION_NEUTRAL,
  VersioningType,
} from '@nestjs/common';
import { ApplicationConfig, HttpAdapterHost } from '@nestjs/core';
import { empty, start } from '../test/routing';
import { endpoint } from './endpoint-fn';
import { EndpointRouter } from './endpoint-router';
import { NestjsEndpoints } from './nestjs-endpoints';

/** What a router's module applies to a consumer, as NestJS gives one to it. */
function recording() {
  const applied: { handlers: unknown[]; exclude: unknown[]; forRoutes: unknown[] }[] = [];
  const consumer = {
    apply: (...handlers: unknown[]) => {
      const entry = { handlers, exclude: [] as unknown[], forRoutes: [] as unknown[] };
      applied.push(entry);
      const to = {
        exclude: (...excluded: unknown[]) => {
          entry.exclude = excluded;
          return to;
        },
        forRoutes: (...routes: unknown[]) => {
          entry.forRoutes = routes;
          return consumer;
        },
      };
      return to;
    },
  };
  return { consumer: consumer as unknown as MiddlewareConsumer, applied };
}

/** An HTTP adapter as far as a router's module reads one: a request's URL. */
const adapter = { getRequestUrl: (request: { url: string }) => request.url };

describe("a router's module, as the app it is in starts", () => {
  const ran: string[] = [];
  function lanes(request: { url: string }, _: unknown, next: () => void) {
    ran.push(request.url);
    next();
  }
  // `/lanes/list` is beside the parameter of `/lanes/:id`.
  const withMiddleware = EndpointRouter.create({
    rootDirectory: empty,
    basePath: 'lanes/:id',
    middleware: [lanes],
    endpoints: [endpoint.query({ path: 'view', handler: () => null })],
  });
  const beside = EndpointRouter.create({
    rootDirectory: empty,
    basePath: 'lanes',
    endpoints: [endpoint.query({ path: 'list', handler: () => null })],
  });
  let app: INestApplicationContext;
  /** What each module applied, and what was warned, as the app configured both. */
  let applied: Awaited<ReturnType<typeof configure>>;
  let warned: { calls: unknown[][]; contexts: unknown[] };

  /** Has the module of `router` configured, as the app does. */
  async function configure(router: Promise<DynamicModule>) {
    const { module } = await router;
    const { consumer, applied } = recording();
    app.get<NestModule>(module, { strict: false }).configure(consumer);
    return applied;
  }

  beforeAll(async () => {
    // An app's root, which lets it have two top-level routers.
    app = await start(NestjsEndpoints.forRoot(), withMiddleware, beside);
    app.get(HttpAdapterHost).httpAdapter = adapter as never;
    const config = app.get(ApplicationConfig);
    config.setGlobalPrefix('api');
    config.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    applied = await configure(withMiddleware);
    await configure(beside);
    warned = { calls: warn.mock.calls, contexts: warn.mock.contexts };
    warn.mockRestore();
  });

  afterAll(() => app.close());

  test("applies its middleware to its base path under the app's versions, and skips the URLs of a name beside its parameter", () => {
    const [only, ...more] = applied;
    expect(more).toEqual([]);
    expect(only!.forRoutes).toEqual([
      { path: 'lanes/:id{/*path}', method: RequestMethod.ALL, version: [VERSION_NEUTRAL, '1'] },
    ]);
    const [middleware] = only!.handlers as (typeof lanes)[];
    for (const url of ['/api/v1/lanes/7/view', '/api/v1/lanes/list', '/api/lanes/list/x']) {
      middleware!({ url }, undefined, () => {});
    }
    expect(ran).toEqual(['/api/v1/lanes/7/view']);
  });

  test('warns, once, that the route with the parameter may answer the URLs of the name', () => {
    expect(warned.calls).toHaveLength(1);
    expect(warned.calls[0]).toEqual([
      '/lanes/:id/view has a path parameter beside routes with a name ' +
        "there. Every URL under a name is the name's route's, but this app's HTTP adapter " +
        'answers a URL with the first route registered that matches it, which may be one with ' +
        "the parameter: that one then refuses it. Set `routeResolutionStrategy: 'specificity'` " +
        'in the options the app is created with: NestJS then registers names before parameters.',
    ]);
    expect((warned.contexts[0] as { context?: string }).context).toBe('nestjs-endpoints');
  });
});
