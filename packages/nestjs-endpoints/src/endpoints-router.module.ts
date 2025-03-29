import fs from 'node:fs';
import path from 'node:path';
import {
  DynamicModule,
  Module,
  ModuleMetadata,
  Type,
} from '@nestjs/common';
import { endpointFileRegex, settings } from './consts';
import { getCallsiteFile } from './helpers';

@Module({})
export class EndpointsRouterModule {
  // eslint-disable-next-line @typescript-eslint/require-await
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
    let endpoints: Type[] = [];
    const endopointFiles = findEndpoints(rootDirectory);
    for (const f of endopointFiles) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const endpoint = require(f).default;
      if (endpoint) {
        endpoints.push(endpoint);
      }
    }
    for (const { setupFn } of settings.endpoints.filter((e) =>
      endopointFiles.some((f) => f === e.file),
    )) {
      setupFn({ rootDirectory, basePath: params?.basePath ?? '/' });
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
      imports: params?.imports,
      exports: params?.exports,
      providers: params?.providers,
      controllers: endpoints,
    };
  }
}

function findEndpoints(dir: string, endopointFiles: string[] = []) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const file = path.join(dir, f);
    if (fs.statSync(file).isDirectory()) {
      findEndpoints(file, endopointFiles);
    }
    if (f.match(endpointFileRegex)) {
      endopointFiles.push(file);
    }
  }
  return endopointFiles;
}
