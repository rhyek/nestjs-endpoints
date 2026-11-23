// A router's middleware: what its `middleware` option lists, and how it is registered once
// for the router's base path and every URL under it.

import {
  type MiddlewareConsumer,
  type NestMiddleware,
  RequestMethod,
  type Type,
  VERSION_NEUTRAL,
  VersioningType,
} from '@nestjs/common';
import type { ApplicationConfig, HttpAdapterHost, ModulesContainer } from '@nestjs/core';
import { type AppRoutes, caseSensitiveOf, namedRequest, routesBut } from './names-beside';
import { isUnder, routesOf, underPattern, unversionedVersion } from './route-paths';
import { trimSlashes } from './url-params';

export type RouterMiddlewareEntry =
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  Type<NestMiddleware> | Function;
type RouterMiddlewareOptions = { exclude?: string[] };
export type RouterMiddlewareList =
  | readonly [...RouterMiddlewareEntry[], RouterMiddlewareOptions]
  | readonly RouterMiddlewareEntry[];

function isMiddlewareOptions(m: unknown): m is RouterMiddlewareOptions {
  return m !== null && typeof m === 'object';
}

/** A router's `middleware`: what it applies, and the options its last entry may be. */
export function parseMiddleware(list: RouterMiddlewareList | undefined): {
  handlers: RouterMiddlewareEntry[];
  exclude: string[];
} {
  const handlers = [...(list ?? [])] as (RouterMiddlewareEntry | RouterMiddlewareOptions)[];
  const options = isMiddlewareOptions(handlers.at(-1))
    ? (handlers.pop() as RouterMiddlewareOptions)
    : undefined;
  if (handlers.some(isMiddlewareOptions)) {
    throw new Error('EndpointRouter: middleware options object must be the last entry');
  }
  return { handlers: handlers as RouterMiddlewareEntry[], exclude: options?.exclude ?? [] };
}

/**
 * Whether NestJS makes a middleware as a class, and does not call it: what its own
 * `isMiddlewareClass` tells. A class, or a function named as one whose prototype has a `use`.
 */
function isMiddlewareClass(handler: RouterMiddlewareEntry): handler is Type<NestMiddleware> {
  const source = handler.toString();
  if (source.startsWith('class')) {
    return true;
  }
  const [keyword, name] = source.split(' ');
  return (
    keyword === 'function' &&
    /[A-Z]/.test(name?.[0] ?? '') &&
    typeof (handler as Type<NestMiddleware>).prototype?.use === 'function'
  );
}

type Use = (request: unknown, response: unknown, next: (error?: unknown) => void) => unknown;

/**
 * A middleware that `skip` passes a request on from: a function in a function, a class in a
 * class of its own, which NestJS makes as it would the class, with what it injects.
 */
export function skipping(
  handler: RouterMiddlewareEntry,
  skip: (request: unknown) => boolean,
): RouterMiddlewareEntry {
  const skipped =
    (use: Use): Use =>
    (request, response, next) =>
      skip(request) ? next() : use(request, response, next);
  if (!isMiddlewareClass(handler)) {
    return skipped(handler as Use) as RouterMiddlewareEntry;
  }
  const Skipping = class extends (handler as new (...args: any[]) => NestMiddleware) {
    constructor(...args: any[]) {
      super(...args);
      // Its `use` as the instance has it: a method of its class, or of a class NestJS makes
      // of this one to leave routes out of it, or a field of its own.
      if (typeof this.use === 'function') {
        this.use = skipped(this.use.bind(this));
      }
    }
  };
  Object.defineProperty(Skipping, 'name', { value: handler.name });
  return Skipping;
}

/** A router's middleware, as it or a router under it applies it. */
export type AppliedMiddleware = {
  handlers: RouterMiddlewareEntry[];
  /** The routes it leaves out, as whole paths. */
  exclude: string[];
  /** The router's base path: its middleware is for the URLs under it. */
  basePath: string;
  /** Whether an app has the router: it then applies its middleware itself. */
  isIn: (modules: ModulesContainer) => boolean;
};

/** A route, as NestJS leaves it out of middleware. */
type Excluded = Exclude<
  Parameters<ReturnType<MiddlewareConsumer['apply']>['exclude']>[number],
  string
>;

/** The app a router's module is in, as it starts. */
export type StartingApp = {
  modules: ModulesContainer;
  config: ApplicationConfig;
  adapter: HttpAdapterHost['httpAdapter'];
  routes: AppRoutes;
};

/**
 * Registers a router's middleware in an app, once, for one pattern: its base path and every
 * URL under it, however many endpoints and routers that is. NestJS runs a module's middleware
 * before that of the modules it imports, so a router's runs before that of the routers
 * nested under it.
 *
 * `lineage` is the middleware of the routers above it by `child()`, then its own. A router
 * made with `child()` has the middleware of the routers above it where an app loads it
 * without them. It then applies theirs itself, before its own: that of each router above
 * it, up to the first the app has, which applies what is above itself.
 */
export function applyRouterMiddleware(
  consumer: MiddlewareConsumer,
  { modules, config, adapter, routes }: StartingApp,
  router: {
    basePath: string;
    /** Every endpoint of its subtree. */
    endpoints: readonly Type[];
    lineage: readonly AppliedMiddleware[];
  },
): void {
  const { basePath, endpoints, lineage } = router;
  const own = lineage.length - 1;
  let from = own;
  while (from > 0 && !lineage[from - 1]!.isIn(modules)) {
    from--;
  }
  const applied = lineage.filter(
    ({ handlers, basePath: above }, at) =>
      at >= from &&
      handlers.length > 0 &&
      // As where the app has that router: for the URLs under its base path.
      (at === own || isUnder(basePath, above)),
  );
  if (applied.length === 0) {
    return;
  }
  // Its routes are served under the versions they have, and so is its pattern: its own
  // `exclude` too, with the app's prefix.
  // Versions are in its URLs only with versions in the app's URLs. A route with none is
  // under the default version, or none.
  const versioning = config.getVersioning();
  const uri = versioning?.type === VersioningType.URI ? versioning : undefined;
  const unversioned = unversionedVersion(versioning) ?? VERSION_NEUTRAL;
  const versions = uri
    ? [
        ...new Set(
          endpoints.flatMap(routesOf).flatMap(({ version }) => [version ?? unversioned].flat()),
        ),
      ]
    : [];
  const version = versions.length > 0 ? (versions as Excluded['version']) : undefined;
  // As NestJS has a route under the router's versions.
  const versioned = (paths: string[]): Excluded[] =>
    paths.map((path) => ({ path, method: RequestMethod.ALL, version }));
  // A name beside a parameter of its base path, and every URL under it, are the name's:
  // its middleware skips them.
  const prefix = trimSlashes(config.getGlobalPrefix());
  const versionPrefix = uri?.prefix !== undefined ? uri.prefix || '' : 'v';
  const named = namedRequest(
    basePath,
    routesBut(routes, (cls) => endpoints.includes(cls)),
    {
      prefix: prefix && `/${prefix}`,
      versionPaths: versions.map((v) =>
        v === VERSION_NEUTRAL ? '' : `/${versionPrefix}${String(v)}`,
      ),
      caseSensitive: caseSensitiveOf(adapter),
    },
  );
  const skipsNames = named
    ? (request: unknown) => named(adapter.getRequestUrl(request).split('?')[0]!)
    : undefined;
  const pattern = underPattern(basePath);
  const forRoutes = version ? versioned([pattern])[0]! : pattern;
  for (const { handlers, exclude } of applied) {
    const excluded = versioned(exclude);
    const to = consumer.apply(
      ...(skipsNames ? handlers.map((handler) => skipping(handler, skipsNames)) : handlers),
    );
    (excluded.length > 0 ? to.exclude(...excluded) : to).forRoutes(forRoutes);
  }
}
