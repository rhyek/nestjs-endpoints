import fs from 'node:fs';
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
  routerModuleFileRegex,
  settings,
} from './consts';
import { getCallsiteFile, moduleAls } from './helpers';

type RouterMiddlewareEntry =
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  Type<NestMiddleware> | Function;
type RouterMiddlewareOptions = { exclude?: string[] };
type RouterMiddlewareList =
  | readonly [...RouterMiddlewareEntry[], RouterMiddlewareOptions]
  | readonly RouterMiddlewareEntry[];

type RouterInterceptor = Type<NestInterceptor> | NestInterceptor;

type RouterGuard = Type<CanActivate> | CanActivate;

const ALL_ENDPOINTS_SYMBOL = Symbol.for('nestjs-endpoints:allEndpoints');

function isMiddlewareOptions(m: unknown): m is RouterMiddlewareOptions {
  return m !== null && typeof m === 'object' && typeof m !== 'function';
}

type EndpointRouterModuleParams = NonNullable<
  Parameters<typeof EndpointRouterModule._register>[1]
>;

@Module({})
export class EndpointRouterModule {
  static async create(
    params?: EndpointRouterModuleParams,
  ): Promise<DynamicModule> {
    return EndpointRouterModule._register(getCallsiteFile(), params);
  }

  /**
   * @deprecated Use `EndpointRouterModule.create()` instead. This alias
   * is kept for backwards compatibility and forwards to `create()`.
   */
  static async register(
    params?: EndpointRouterModuleParams,
  ): Promise<DynamicModule> {
    return EndpointRouterModule._register(getCallsiteFile(), params);
  }

  static async _register(
    callsiteFile: string,
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
       *   rootDirectory: ['endpoints', 'clinica']  // each entry scanned independently
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
       */
      endpoints?: Type[];
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
    },
  ): Promise<DynamicModule> {
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
    const parentStore = moduleAls.getStore();
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
    const nestedRouterModuleFiles: string[] = [];
    const endopointFiles: string[] = [];
    for (const root of rootDirectories) {
      findEndpoints(
        root,
        nestedRouterModuleFiles,
        endopointFiles,
        callsiteFile,
      );
    }
    const endpointFilesNotImported = endopointFiles.filter((f) =>
      settings.endpoints.every((e) => e.file !== f),
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
    await moduleAls.run(
      {
        parentBasePath: normalizedParentBasePath,
        parentModuleDir: definedAtDir,
        parentRootDirectories: rootDirectories,
        parentNamespaceChain: effectiveNamespaceChain,
      },
      // eslint-disable-next-line @typescript-eslint/require-await -- needed since we are replacing the require with await import during build for esm
      async () => {
        for (const f of endpointFilesNotImported) {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const endpoint = require(f).default;
          if (endpoint) {
            endpoints.push(endpoint);
          }
        }
        for (const f of nestedRouterModuleFiles) {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const nestedModule = require(f).default;
          if (nestedModule) {
            nestedModules.push(nestedModule);
          }
        }
      },
    );
    for (const { setupFn } of settings.endpoints.filter((e) =>
      endpointFilesNotImported.some((f) => f === e.file),
    )) {
      setupFn({
        rootDirectories,
        basePath: effectiveBasePath,
        namespaceChain: effectiveNamespaceChain,
      });
    }
    if (params?.endpoints) {
      for (const ep of params.endpoints) {
        const epSetupFn = Reflect.getMetadata('endpoints:setupFn', ep) as
          | ((s: {
              rootDirectories: string[];
              basePath: string;
              namespaceChain: string[];
            }) => void)
          | undefined;
        if (epSetupFn) {
          epSetupFn({
            rootDirectories,
            basePath: effectiveBasePath,
            namespaceChain: effectiveNamespaceChain,
          });
        }
        if (!endpoints.includes(ep)) {
          endpoints.push(ep);
        }
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
    const forRoutesPattern = normalizedParentBasePath
      ? `${normalizedParentBasePath}/*`
      : '*';

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

function findEndpoints(
  dir: string,
  nestedRouterModuleFiles: string[],
  endopointFiles: string[],
  callerRouterModuleFile: string,
) {
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return endopointFiles;
  }
  // A directory that contains a `router.module.*` file is treated as a
  // nested router — regardless of depth. The only exception is the
  // caller's own router module file (avoids self-registration when a
  // `rootDirectory` entry happens to resolve to the caller's own folder).
  const routerFile = files.find((f) => f.match(routerModuleFileRegex));
  if (routerFile) {
    const routerFilePath = path.join(dir, routerFile);
    if (routerFilePath !== callerRouterModuleFile) {
      nestedRouterModuleFiles.push(routerFilePath);
      return endopointFiles;
    }
  }
  for (const f of files) {
    const file = path.join(dir, f);
    if (fs.statSync(file).isDirectory()) {
      findEndpoints(
        file,
        nestedRouterModuleFiles,
        endopointFiles,
        callerRouterModuleFile,
      );
    }
    if (f.match(endpointFileRegex)) {
      endopointFiles.push(file);
    }
  }
  return endopointFiles;
}
