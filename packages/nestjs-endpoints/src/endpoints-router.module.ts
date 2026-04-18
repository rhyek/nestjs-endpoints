import fs from 'node:fs';
import path from 'node:path';
import {
  DynamicModule,
  Module,
  ModuleMetadata,
  Type,
} from '@nestjs/common';
import {
  endpointFileRegex,
  routerModuleFileRegex,
  settings,
} from './consts';
import { getCallsiteFile, moduleAls } from './helpers';

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
    const nestedModules: DynamicModule[] = [];

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

    return {
      module: EndpointsRouterModule,
      imports: [...(params?.imports ?? []), ...nestedModules],
      exports: params?.exports,
      providers: params?.providers,
      controllers: endpoints,
    };
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
