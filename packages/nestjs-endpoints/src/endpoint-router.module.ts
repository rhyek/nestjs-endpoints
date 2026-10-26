import path from 'node:path';
import {
  CanActivate,
  DynamicModule,
  MiddlewareConsumer,
  Module,
  ModuleMetadata,
  NestInterceptor,
  NestMiddleware,
  NestModule,
  Type,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  endpointFileRegex,
  EndpointSetupFn,
  routerModuleFileRegex,
  settings,
} from './consts.js';
import {
  createRouterEndpoint,
  EndpointBuilders,
  InjectOnRequestMap,
  InjectProvidersMap,
  WithoutKeys,
} from './endpoint-fn.js';
import { getCallsiteFile, moduleAls } from './helpers.js';
import { LazyPromise } from './lazy-promise.js';
import {
  EndpointManifestLoader,
  findManifestCovering,
  RegisteredManifest,
} from './manifest/registry.js';
import { MANIFEST_FILE_NAME } from './manifest/render.js';
import { isSameModule, stripExtension } from './manifest/scan.js';

/**
 * Express 5 / path-to-regexp v8, used by every NestJS version this library
 * supports, requires named wildcards instead of a bare `*`. A bare `*` still
 * routes correctly via NestJS's `LegacyRouteConverter`, but emits a
 * deprecation warning per `forRoutes` call.
 */
const MIDDLEWARE_WILDCARD_SEGMENT = '{*path}';

type RouterMiddlewareEntry =
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  Type<NestMiddleware> | Function;
type RouterMiddlewareOptions = { exclude?: string[] };
type RouterMiddlewareList =
  | readonly [...RouterMiddlewareEntry[], RouterMiddlewareOptions]
  | readonly RouterMiddlewareEntry[];

type RouterInterceptor = Type<NestInterceptor> | NestInterceptor;

type RouterGuard = Type<CanActivate> | CanActivate;

/**
 * What a router's `endpoints` callback lists: an endpoint class, a promise
 * of one, or a promise of a module, as `import()` of a file resolves to,
 * which lists every endpoint the module exports.
 */
type ListedEndpoint = Type | Promise<object>;

const ALL_ENDPOINTS_SYMBOL = Symbol.for('nestjs-endpoints:allEndpoints');

function isMiddlewareOptions(m: unknown): m is RouterMiddlewareOptions {
  return m !== null && typeof m === 'object' && typeof m !== 'function';
}

type EndpointRouterModuleParams<
  RouterInject extends InjectProvidersMap,
  RouterInjectOnRequest extends InjectOnRequestMap,
> = NonNullable<
  Parameters<
    typeof EndpointRouterModule._register<
      RouterInject,
      RouterInjectOnRequest
    >
  >[2]
>;

/**
 * What `create()` returns: the module a router module exports by default,
 * carrying the router's `endpoint` builders.
 */
export type EndpointRouter<
  RouterInject extends InjectProvidersMap = undefined,
  RouterInjectOnRequest extends InjectOnRequestMap = undefined,
> = Promise<DynamicModule> & {
  endpoint: EndpointBuilders<RouterInject, RouterInjectOnRequest>;
};

type ParentStore = NonNullable<ReturnType<typeof moduleAls.getStore>>;

/**
 * A nested router's file (without its extension) → the context of the
 * router that discovered it, set before that router loads it. A router
 * module can be evaluated before its parent runs (a spec imports it, or a
 * file that imports it, first) or while another router runs, so the store
 * `create()` sees is not always its parent's.
 */
const nestedRouterParents = new Map<string, ParentStore>();

/**
 * Captures what must be read at the call itself — the calling file and the
 * parent router's context — and defers the rest until the module is awaited.
 * NestJS awaits it while scanning modules, after the app's whole import graph
 * has been evaluated, so the endpoint manifest is registered by then no
 * matter where the app imports it.
 */
function createLazily(
  callsiteFile: string,
  params: EndpointRouterModuleParams<any, any> | undefined,
): EndpointRouter<any, any> {
  const parentStore = moduleAls.getStore();
  return Object.assign(
    new LazyPromise(() =>
      EndpointRouterModule._register(callsiteFile, parentStore, params),
    ),
    {
      endpoint: createRouterEndpoint(
        callsiteFile,
        params?.endpointConfig?.inject,
        params?.endpointConfig?.injectOnRequest,
      ),
    },
  );
}

@Module({})
export class EndpointRouterModule {
  static create<
    RouterInject extends InjectProvidersMap = undefined,
    RouterInjectOnRequest extends InjectOnRequestMap = undefined,
  >(
    params?: EndpointRouterModuleParams<
      RouterInject,
      RouterInjectOnRequest
    >,
  ): EndpointRouter<RouterInject, RouterInjectOnRequest> {
    return createLazily(getCallsiteFile(), params);
  }

  /**
   * @deprecated Use `EndpointRouterModule.create()` instead. This alias
   * is kept for backwards compatibility and forwards to `create()`.
   */
  static register<
    RouterInject extends InjectProvidersMap = undefined,
    RouterInjectOnRequest extends InjectOnRequestMap = undefined,
  >(
    params?: EndpointRouterModuleParams<
      RouterInject,
      RouterInjectOnRequest
    >,
  ): EndpointRouter<RouterInject, RouterInjectOnRequest> {
    return createLazily(getCallsiteFile(), params);
  }

  // Generic only so that `create()` types the router's `endpoint` from
  // `endpointConfig`.
  static async _register<
    RouterInject extends InjectProvidersMap = undefined,
    RouterInjectOnRequest extends InjectOnRequestMap = undefined,
  >(
    callsiteFile: string,
    // Captured where `create()` was called, for a router no parent
    // discovered. Never read from the store here, when the deferred work
    // runs: that could pick up whichever router awaited it.
    capturedParentStore: ReturnType<typeof moduleAls.getStore>,
    params?: {
      /**
       * Directory (or directories) this router loads endpoints from. Relative
       * paths are resolved against the calling file's directory; absolute
       * paths are used as-is.
       *
       * Each entry is scanned recursively. Any directory encountered that
       * contains a `router.module.*` file is auto-discovered as a nested
       * router (regardless of depth) — the parent imports it and does not
       * scan inside it. Directories without a `router.module.*` are scanned
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
       * - **Top-level `router.module.ts`**: the folder containing the file
       *   (e.g. `src/auth/router.module.ts` → `basePath: 'auth'`).
       * - **Nested**: the parent's effective `basePath` joined with the
       *   child's folder relative to its matching parent root — or, if the
       *   child doesn't sit inside one of the parent's `rootDirectories`,
       *   relative to the parent module file's own folder.
       * - **Other callsites** (e.g. `app.module.ts`, or any file not named
       *   `router.module.*`): no folder inference; defaults to `'/'`.
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
       *   `router.module.*` file).
       * - `string`: use this exact value as the segment.
       *
       * Operations receive the full chain as the OpenAPI `x-namespace`
       * extension; `setupCodegen` consumes this to emit the nested SDK.
       */
      namespace?: boolean | string;
      /**
       * Human-readable description for this router's group. Surfaces in
       * two places:
       *
       * - **OpenAPI**: registered as a top-level `tags[]` entry keyed by
       *   the router's effective namespace (or `basePath` if no
       *   namespace is declared). Swagger UI renders it under the
       *   matching group header.
       * - **Generated SDK**: emitted as a JSDoc comment on the matching
       *   bucket key on the `api` object, so editors show it on hover.
       */
      description?: string;
      imports?: ModuleMetadata['imports'];
      exports?: ModuleMetadata['exports'];
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
      endpoints?: Type[] | (() => ListedEndpoint[]);
      /**
       * Middleware to apply to all routes under this router's `basePath`
       * (including endpoints from nested router modules). The last entry may
       * optionally be an options object, e.g. `{ exclude: ['list'] }`, where
       * each exclude path is resolved against the router's `basePath`.
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
       * Configures the `endpoint` builders this router returns
       * (`router.endpoint.query(...)`). Endpoints built with them receive
       * these injections along with their own; endpoints of nested routers
       * do not, and those routers declare their own. A key goes in one of
       * the two maps, not both.
       */
      endpointConfig?: {
        /** Providers to inject, as the endpoint option of the same name. */
        inject?: RouterInject;
        /** Request-time parameters, as the endpoint option of the same name. */
        injectOnRequest?: WithoutKeys<
          RouterInjectOnRequest,
          keyof RouterInject,
          'is in both inject and injectOnRequest'
        >;
      };
    },
  ): Promise<DynamicModule> {
    const parentStore =
      nestedRouterParents.get(stripExtension(callsiteFile)) ??
      capturedParentStore;
    const definedAtDir = path.dirname(callsiteFile);
    const resolveDir = (dir: string) => {
      if (!path.isAbsolute(dir)) {
        return path.join(definedAtDir, dir);
      }
      return dir;
    };
    const rootDirectories = ((): string[] => {
      if (!params?.rootDirectory) {
        return [definedAtDir];
      }
      const raw = Array.isArray(params.rootDirectory)
        ? params.rootDirectory
        : [params.rootDirectory];
      return raw.map(resolveDir);
    })();
    const effectiveBasePath = ((): string => {
      if (params?.basePath !== undefined) {
        return params.basePath;
      }
      if (parentStore) {
        // If this child sits under (or is) one of the parent's
        // rootDirectories, derive the suffix from that — this preserves
        // the legacy `rootDirectory: './endpoints'` + nested-router
        // pattern. Otherwise, use path.relative between module files.
        const matchingRoot = parentStore.parentRootDirectories.find(
          (r) =>
            definedAtDir === r || definedAtDir.startsWith(r + path.sep),
        );
        let suffix: string;
        if (matchingRoot) {
          suffix =
            definedAtDir === matchingRoot
              ? path.basename(definedAtDir)
              : path.relative(matchingRoot, definedAtDir);
        } else {
          suffix = path.relative(
            parentStore.parentModuleDir,
            definedAtDir,
          );
        }
        suffix = suffix.split(path.sep).join('/');
        const segments = [
          ...parentStore.parentBasePath.split('/').filter(Boolean),
          ...suffix.split('/').filter(Boolean),
        ];
        return segments.length > 0 ? '/' + segments.join('/') : '/';
      }
      // Top-level: infer from the router module file's own folder name,
      // but only when the callsite is a `router.module.*` file. That way,
      // calling `register()` from an `app.module.ts` (or any other module)
      // keeps the legacy `'/'` default and doesn't silently prefix routes
      // with the app's top folder.
      if (routerModuleFileRegex.test(path.basename(callsiteFile))) {
        return '/' + path.basename(definedAtDir);
      }
      return '/';
    })();
    const parentNamespaceChain = parentStore?.parentNamespaceChain ?? [];
    const ownNamespaceSegment = ((): string | null => {
      const ns = params?.namespace;
      if (ns === undefined || ns === false) return null;
      if (typeof ns === 'string') return ns;
      // `true`: mirror whatever drove `basePath`. When `basePath` is
      // set explicitly, use its trimmed value so the SDK shape tracks
      // the URL the consumer chose. Otherwise fall back to folder-name
      // inference (same rule as `basePath` inference).
      if (params?.basePath !== undefined) {
        const trimmed = params.basePath.replace(/^\/+|\/+$/g, '');
        if (trimmed) return trimmed;
      }
      if (routerModuleFileRegex.test(path.basename(callsiteFile))) {
        return path.basename(definedAtDir);
      }
      return null;
    })();
    const effectiveNamespaceChain = ownNamespaceSegment
      ? [...parentNamespaceChain, ownNamespaceSegment]
      : parentNamespaceChain;
    let endpoints: Type[] = [];
    // Discovered file → the loader of the manifest it was discovered in.
    const nestedRouterModuleFiles = new Map<
      string,
      EndpointManifestLoader
    >();
    const endpointFiles = new Map<string, EndpointManifestLoader>();
    for (const root of rootDirectories) {
      const manifest = findManifestCovering(root);
      if (!manifest) {
        // A router that only lists its endpoints has nothing to discover.
        if (params?.endpoints && params.rootDirectory === undefined)
          continue;
        throw new Error(missingManifestMessage(root));
      }
      findEndpoints(
        manifest,
        root,
        nestedRouterModuleFiles,
        endpointFiles,
        callsiteFile,
      );
    }
    const endpointFilesNotImported = [...endpointFiles].filter(([f]) =>
      settings.endpoints.every((e) => !isSameModule(e.file, f)),
    );
    const nestedModules: (DynamicModule | Promise<DynamicModule>)[] = [];

    const normalizedParentBasePath = effectiveBasePath.replace(
      /^\/+|\/+$/g,
      '',
    );
    if (params?.description) {
      // Tag name tracks the same key endpoints will be tagged with
      // below (namespace chain if set, else the basePath). Without
      // either, there's no group to attach a description to.
      const tagName =
        effectiveNamespaceChain.length > 0
          ? effectiveNamespaceChain.join('/')
          : normalizedParentBasePath;
      if (tagName) {
        const existing = settings.openapi.tags.find(
          (t) => t.name === tagName,
        );
        if (existing) {
          existing.description = params.description;
        } else {
          settings.openapi.tags.push({
            name: tagName,
            description: params.description,
          });
        }
      }
    }
    const ownStore: ParentStore = {
      parentBasePath: normalizedParentBasePath,
      parentModuleDir: definedAtDir,
      parentRootDirectories: rootDirectories,
      parentNamespaceChain: effectiveNamespaceChain,
    };
    for (const file of nestedRouterModuleFiles.keys()) {
      nestedRouterParents.set(stripExtension(file), ownStore);
    }
    let listedEndpoints: Type[] = [];
    await moduleAls.run(ownStore, async () => {
      for (const [, load] of endpointFilesNotImported) {
        const endpoint = await loadDefault(load);
        if (endpoint) {
          endpoints.push(endpoint);
        }
      }
      for (const load of nestedRouterModuleFiles.values()) {
        const nestedModule = await loadDefault(load);
        if (nestedModule) {
          nestedModules.push(nestedModule);
        }
      }
      // Imported here, inside this router's run, so each endpoint defined
      // by a listed file is set up once, below, by this router.
      listedEndpoints =
        typeof params?.endpoints === 'function'
          ? (
              await Promise.all(
                params
                  .endpoints()
                  .map((listed) =>
                    resolveListedEndpoints(listed, callsiteFile),
                  ),
              )
            ).flat()
          : (params?.endpoints ?? []);
    });
    const setUp = new Set<EndpointSetupFn>();
    for (const { setupFn } of settings.endpoints.filter((e) =>
      endpointFilesNotImported.some(([f]) => isSameModule(f, e.file)),
    )) {
      setupFn({
        rootDirectories,
        basePath: effectiveBasePath,
        namespaceChain: effectiveNamespaceChain,
        routerFile: callsiteFile,
      });
      setUp.add(setupFn);
    }
    for (const ep of listedEndpoints) {
      const epSetupFn = Reflect.getMetadata('endpoints:setupFn', ep) as
        EndpointSetupFn | undefined;
      // A listed endpoint this router also discovered is set up already.
      if (epSetupFn && !setUp.has(epSetupFn)) {
        epSetupFn({
          rootDirectories,
          basePath: effectiveBasePath,
          namespaceChain: effectiveNamespaceChain,
          routerFile: callsiteFile,
        });
      }
      if (!endpoints.includes(ep)) {
        endpoints.push(ep);
      }
    }
    if (endpoints.length > 0) {
      endpoints = endpoints.filter((e) => {
        return Reflect.getMetadataKeys(e).some(
          (k) => k === 'endpoints:path',
        );
      });
    }

    // Resolve nested modules to collect their endpoint classes (for
    // interceptor application). Nested modules are still passed along as
    // the original (possibly Promise) values via imports.
    const resolvedNestedModules = await Promise.all(
      nestedModules.map((m) => Promise.resolve(m)),
    );
    const nestedAllEndpoints: Type[] = resolvedNestedModules.flatMap(
      (m) =>
        (m as unknown as Record<symbol, Type[] | undefined>)[
          ALL_ENDPOINTS_SYMBOL
        ] ?? [],
    );
    const allEndpoints: Type[] = [...endpoints, ...nestedAllEndpoints];

    // Apply interceptors (controller-scoped) to all endpoints in the
    // subtree, including nested ones.
    if (params?.interceptors && params.interceptors.length > 0) {
      const interceptorDecorator = UseInterceptors(...params.interceptors);
      for (const ep of allEndpoints) {
        interceptorDecorator(ep);
      }
    }

    // Apply guards (controller-scoped) to all endpoints in the subtree,
    // including nested ones.
    if (params?.guards && params.guards.length > 0) {
      const guardDecorator = UseGuards(...params.guards);
      for (const ep of allEndpoints) {
        guardDecorator(ep);
      }
    }

    // Parse middleware list into handlers + optional options entry.
    const middlewareHandlers: RouterMiddlewareEntry[] = [];
    let middlewareOptions: RouterMiddlewareOptions | undefined;
    if (params?.middleware) {
      const mwList = params.middleware as ReadonlyArray<
        RouterMiddlewareEntry | RouterMiddlewareOptions
      >;
      for (let i = 0; i < mwList.length; i++) {
        const item = mwList[i];
        if (isMiddlewareOptions(item)) {
          if (i !== mwList.length - 1) {
            throw new Error(
              'EndpointRouterModule: middleware options object must be the last entry',
            );
          }
          middlewareOptions = item;
        } else {
          middlewareHandlers.push(item);
        }
      }
    }
    const excludeRoutes = middlewareOptions?.exclude?.map((p) =>
      normalizedParentBasePath ? `${normalizedParentBasePath}/${p}` : p,
    );
    const wildcardSegment = MIDDLEWARE_WILDCARD_SEGMENT;
    const forRoutesPattern = normalizedParentBasePath
      ? `${normalizedParentBasePath}/${wildcardSegment}`
      : wildcardSegment;

    class RouterModule extends EndpointRouterModule implements NestModule {
      configure(consumer: MiddlewareConsumer) {
        if (middlewareHandlers.length === 0) return;
        let applied = consumer.apply(...middlewareHandlers);
        if (excludeRoutes && excludeRoutes.length > 0) {
          applied = applied.exclude(...excludeRoutes);
        }
        applied.forRoutes(forRoutesPattern);
      }
    }
    Module({})(RouterModule);

    const dynamicModule: DynamicModule = {
      module: RouterModule,
      imports: [...(params?.imports ?? []), ...nestedModules],
      exports: params?.exports,
      providers: params?.providers,
      controllers: endpoints,
    };
    (dynamicModule as unknown as Record<symbol, Type[]>)[
      ALL_ENDPOINTS_SYMBOL
    ] = allEndpoints;

    return dynamicModule;
  }
}

/**
 * @deprecated Use `EndpointRouterModule` instead. This alias is kept for
 * backwards compatibility and refers to the same class.
 */
export const EndpointsRouterModule = EndpointRouterModule;
/**
 * @deprecated Use `EndpointRouterModule` instead.
 */
export type EndpointsRouterModule = EndpointRouterModule;

/**
 * Walks `dir` in the manifest's view of the source tree. The manifest keys
 * carry source extensions while a compiled app runs `.js` files, so files
 * are compared without their extension.
 */
function findEndpoints(
  manifest: RegisteredManifest,
  dir: string,
  nestedRouterModuleFiles: Map<string, EndpointManifestLoader>,
  endpointFiles: Map<string, EndpointManifestLoader>,
  callerRouterModuleFile: string,
) {
  const entries = manifest.tree.get(dir);
  if (!entries) {
    return;
  }
  // A directory that contains a `router.module.*` file is treated as a
  // nested router — regardless of depth. The only exception is the
  // caller's own router module file (avoids self-registration when a
  // `rootDirectory` entry happens to resolve to the caller's own folder).
  const routerFile = [...entries.keys()].find((f) =>
    routerModuleFileRegex.test(f),
  );
  if (routerFile) {
    const routerFilePath = path.join(dir, routerFile);
    if (!isSameModule(routerFilePath, callerRouterModuleFile)) {
      nestedRouterModuleFiles.set(
        routerFilePath,
        manifest.loaders.get(routerFilePath)!,
      );
      return;
    }
  }
  for (const [f, isDirectory] of entries) {
    const file = path.join(dir, f);
    if (isDirectory) {
      findEndpoints(
        manifest,
        file,
        nestedRouterModuleFiles,
        endpointFiles,
        callerRouterModuleFile,
      );
    } else if (endpointFileRegex.test(f)) {
      endpointFiles.set(file, manifest.loaders.get(file)!);
    }
  }
}

async function resolveListedEndpoints(
  listed: ListedEndpoint,
  routerFile: string,
): Promise<Type[]> {
  const resolved = await listed;
  if (typeof resolved === 'function') {
    return [resolved as Type];
  }
  // A module: its exports that are endpoints, default or named.
  const exported = Object.values(resolved).filter(
    (value): value is Type =>
      typeof value === 'function' &&
      Reflect.hasMetadata('endpoints:setupFn', value),
  );
  if (exported.length === 0) {
    throw new Error(
      `EndpointRouterModule.create() in ${routerFile}: \`endpoints\` lists ` +
        'a module that exports no endpoint.',
    );
  }
  return exported;
}

async function loadDefault(load: EndpointManifestLoader): Promise<any> {
  const module = (await load()) as { default?: unknown };
  return module.default;
}

function missingManifestMessage(rootDirectory: string): string {
  const shown = path.relative(process.cwd(), rootDirectory) || '.';
  return [
    `nestjs-endpoints: no endpoint manifest covers "${shown}".`,
    `File-based routing loads endpoint files through a generated ${MANIFEST_FILE_NAME}, which must be imported before Nest builds the module.`,
    `Create it with \`npx nestjs-endpoints init\` (or \`npx nestjs-endpoints generate\`), then import it from your app module: import './endpoints.gen.js'; (\`.ts\` if you generated it with \`--import-extension ts\`)`,
    `A test that imports a router module without the app module imports it too, or lists it in Vitest's \`setupFiles\`. Importing it loads no endpoints.`,
  ].join('\n');
}
