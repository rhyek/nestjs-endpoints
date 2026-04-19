import fs from 'node:fs';
import path from 'node:path';
import {
  DynamicModule,
  MiddlewareConsumer,
  Module,
  ModuleMetadata,
  NestInterceptor,
  NestMiddleware,
  NestModule,
  Type,
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

const ALL_ENDPOINTS_SYMBOL = Symbol.for('nestjs-endpoints:allEndpoints');

function isMiddlewareOptions(m: unknown): m is RouterMiddlewareOptions {
  return m !== null && typeof m === 'object' && typeof m !== 'function';
}

@Module({})
export class EndpointsRouterModule {
  static async register(params?: {
    /**
     * The root directory to load endpoints from recursively. Relative and absolute
     * paths are supported.
     * @default The directory of the calling file
     */
    rootDirectory?: string;
    /**
     * The base path to use for endpoints in this module.
     * @default '/'
     */
    basePath?: string;
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
  }): Promise<DynamicModule> {
    const definedAtDir = path.dirname(getCallsiteFile());
    const resolveDir = (dir: string) => {
      if (!path.isAbsolute(dir)) {
        return path.join(definedAtDir, dir);
      }
      return dir;
    };
    const rootDirectory = params?.rootDirectory
      ? resolveDir(params.rootDirectory)
      : definedAtDir;
    const parentStore = moduleAls.getStore();
    const effectiveBasePath = ((): string => {
      if (params?.basePath !== undefined) {
        return params.basePath;
      }
      if (
        parentStore?.parentRootDirectory &&
        parentStore.parentRootDirectory !== rootDirectory
      ) {
        const relative = path
          .relative(parentStore.parentRootDirectory, definedAtDir)
          .split(path.sep)
          .join('/');
        return '/' + relative;
      }
      return '/';
    })();
    let endpoints: Type[] = [];
    const nestedRouterModuleFiles: string[] = [];
    const endopointFiles = findEndpoints(
      rootDirectory,
      nestedRouterModuleFiles,
    );
    const endpointFilesNotImported = endopointFiles.filter((f) =>
      settings.endpoints.every((e) => e.file !== f),
    );
    const nestedModules: (DynamicModule | Promise<DynamicModule>)[] = [];

    await moduleAls.run(
      { parentRootDirectory: rootDirectory },
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
      setupFn({ rootDirectory, basePath: effectiveBasePath });
    }
    if (params?.endpoints) {
      for (const ep of params.endpoints) {
        const epSetupFn = Reflect.getMetadata('endpoints:setupFn', ep) as
          | ((s: { rootDirectory: string; basePath: string }) => void)
          | undefined;
        if (epSetupFn) {
          epSetupFn({ rootDirectory, basePath: effectiveBasePath });
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
              'EndpointsRouterModule: middleware options object must be the last entry',
            );
          }
          middlewareOptions = item;
        } else {
          middlewareHandlers.push(item);
        }
      }
    }
    const normalizedBasePath = effectiveBasePath.replace(/^\/+|\/+$/g, '');
    const excludeRoutes = middlewareOptions?.exclude?.map((p) =>
      normalizedBasePath ? `${normalizedBasePath}/${p}` : p,
    );
    const forRoutesPattern = normalizedBasePath
      ? `${normalizedBasePath}/*`
      : '*';

    class RouterModule
      extends EndpointsRouterModule
      implements NestModule
    {
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

function findEndpoints(
  dir: string,
  nestedRouterModuleFiles: string[],
  endopointFiles: string[] = [],
  isRoot = true,
) {
  const files = fs.readdirSync(dir);
  if (!isRoot) {
    const routerFile = files.find((f) => f.match(routerModuleFileRegex));
    if (routerFile) {
      nestedRouterModuleFiles.push(path.join(dir, routerFile));
      return endopointFiles;
    }
  }
  for (const f of files) {
    const file = path.join(dir, f);
    if (fs.statSync(file).isDirectory()) {
      findEndpoints(file, nestedRouterModuleFiles, endopointFiles, false);
    }
    if (f.match(endpointFileRegex)) {
      endopointFiles.push(file);
    }
  }
  return endopointFiles;
}
