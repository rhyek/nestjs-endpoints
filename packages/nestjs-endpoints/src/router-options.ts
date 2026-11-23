import type { ModuleMetadata, Type } from '@nestjs/common';
import type { z } from 'zod';
import type { InjectOnRequestMap, InjectProvidersMap } from './injections';
import type { EndpointOwnMembers, InjectNaming } from './instance-members';
import type { WithoutKeys } from './router-context';
import type { RouterGuard, RouterInterceptor } from './router-lineage';
import type { ListedEndpoint } from './router-loading';
import type { RouterMiddlewareList } from './router-middleware';

/**
 * What a router gives every endpoint built with its `endpoint`, and every router made with its
 * `child()`, under what those declare themselves: a key both declare is theirs. The router's
 * own instance has none of it.
 */
export type RouterContextOptions<
  RouterInject extends InjectProvidersMap,
  RouterInjectOnRequest extends InjectOnRequestMap,
  RouterParams extends z.ZodObject | undefined,
> = {
  /**
   * Providers to inject into each of those endpoints, as the endpoint
   * option of the same name. A key goes in `inject` or `injectOnRequest`,
   * not both.
   */
  // On each endpoint's `this`, which has its `handler` and `invoke` names to keep.
  inject?: InjectNaming<RouterInject, EndpointOwnMembers>;
  /**
   * Request-time parameters for each of those endpoints, as the endpoint
   * option of the same name.
   */
  injectOnRequest?: WithoutKeys<
    RouterInjectOnRequest,
    keyof RouterInject,
    'is in both inject and injectOnRequest'
  >;
  /**
   * Path parameters of each of those endpoints: a plain `z.object()`
   * whose keys are `:param`s of each of their URLs, as a `$param` folder
   * gives them. An endpoint declares only the parameters of its own.
   *
   * @example
   *   // src/endpoints/clinics/$clinicId/router.ts
   *   context: { params: z.object({ clinicId: z.uuid() }) }
   */
  params?: RouterParams;
};

/** The keys of a router's `context`. */
export const CONTEXT_KEYS = ['params', 'inject', 'injectOnRequest'] as const;

/**
 * What a router is configured with, of what `create()`, `child()` and `forRoot()` take: the
 * rest is its `this` (`EndpointRouterOptions`).
 */
export type RouterOptions<
  RouterInject extends InjectProvidersMap,
  RouterInjectOnRequest extends InjectOnRequestMap,
  RouterParams extends z.ZodObject | undefined,
> = {
  /**
   * Directory (or directories) this router loads endpoints from. Relative
   * paths are resolved against the calling file's directory; absolute
   * paths are used as-is.
   *
   * Each entry is scanned recursively. Any directory encountered that
   * contains a `router.ts` file is auto-discovered as a nested
   * router (regardless of depth) — the parent imports it and does not
   * scan inside it. Directories without a `router.ts` are scanned
   * for `*.endpoint.ts` files (non-`_`-prefixed subfolders contribute
   * to the inferred URL path).
   *
   * @example
   *   rootDirectory: './endpoints'             // single scan root
   *   rootDirectory: ['endpoints', 'admin']  // each entry scanned independently
   *
   * @default The directory of the calling file.
   */
  rootDirectory?: string | string[];
  /**
   * The base path to prepend to every endpoint owned by this router.
   *
   * When omitted, `basePath` is inferred:
   *
   * - **Top-level `router.ts`**: the folder containing the file
   *   (e.g. `src/auth/router.ts` → `basePath: 'auth'`).
   * - **Nested**: the parent's effective `basePath` joined with the
   *   child's folder relative to its matching parent root — or, if the
   *   child doesn't sit inside one of the parent's `rootDirectories`,
   *   relative to the parent module file's own folder.
   * - **Other callsites** (e.g. `app.module.ts`, or any file not named
   *   `router.ts`): no folder inference; defaults to `'/'`.
   *
   * Pass `''` or `'/'` to opt out of inference and mount at the root.
   */
  basePath?: string;
  /**
   * Opt-in namespace segment for the generated SDK's nested `api`
   * object. Does not affect URL routing. Behaves like `basePath` for
   * the SDK shape:
   *
   * - `false` / omitted: this router contributes nothing to the
   *   namespace chain. Endpoints inherit the parent's chain (if any).
   * - `true`: the segment is inferred from this router's folder name
   *   (same rule as `basePath`: only when the callsite is a
   *   `router.ts` file).
   * - `string`: use this exact value as the segment.
   *
   * Operations receive the full chain as the OpenAPI `x-namespace`
   * extension; `setupCodegen` consumes this to emit the nested SDK.
   */
  namespace?: boolean | string;
  /**
   * Human-readable description for this router's namespace, emitted in
   * the generated clients as a comment on it, so editors show it on
   * hover. Only beside `namespace`.
   */
  description?: string;
  /**
   * Modules whose exports this router's endpoints and providers can
   * inject, and those of every router made with its `child()`.
   */
  imports?: ModuleMetadata['imports'];
  /**
   * Providers for this router's endpoints, and for those of every router
   * made with its `child()`, as the same instances. A child that lists
   * one again has an instance of its own.
   */
  providers?: ModuleMetadata['providers'];
  /**
   * Endpoints to register manually. Behaves similarly to the `controllers`
   * key on NestJS modules. The router's `basePath` is prepended to each
   * endpoint's path.
   *
   * A callback is called when the router runs, after its module has
   * finished evaluating, so the endpoints it imports can be built with
   * this router's `endpoint`. An `import()` lists every endpoint the
   * module exports:
   *
   * @example
   *   endpoints: () => [
   *     import('./list.endpoint.js'),
   *     import('./find.endpoint.js'),
   *   ]
   */
  // No `this`: it is called on nothing, and not on the router's instance.
  endpoints?: Type[] | ((this: void) => ListedEndpoint[]);
  /**
   * Middleware for this router's `basePath` and every URL under it: its
   * endpoints, and those of the routers nested under it. The last entry
   * may be an options object, e.g. `{ exclude: ['list'] }`, where each
   * path is resolved against the router's `basePath`.
   */
  middleware?: RouterMiddlewareList;
  /**
   * Interceptors to apply (controller-scoped) to each endpoint owned by
   * this router, including endpoints from nested router modules.
   */
  interceptors?: RouterInterceptor[];
  /**
   * Guards to apply (controller-scoped) to each endpoint owned by this
   * router, including endpoints from nested router modules.
   */
  guards?: RouterGuard[];
  /**
   * What the router gives its endpoints and the routers under it:
   * `params`, `inject` and `injectOnRequest`.
   *
   * @example
   *   context: {
   *     params: z.object({ clinicId: z.uuid() }),
   *     inject: { clinics: ClinicsService },
   *   }
   */
  context?: RouterContextOptions<RouterInject, RouterInjectOnRequest, RouterParams>;
};

/**
 * A router's `description` documents its namespace: the options take one only beside
 * `namespace`.
 */
export type DescribesNamespace =
  | { namespace: boolean | string; description?: string }
  | {
      namespace?: undefined;
      description?: '`description` documents a namespace: set `namespace` on this router';
    };
