import fs from 'node:fs';
import path from 'node:path';
import {
  DynamicModule,
  Module,
  ModuleMetadata,
  Type,
} from '@nestjs/common';
import callsites from 'callsites';
import { endpointFileRegex, settings } from './consts';

@Module({})
export class EndpointsRouterModule {
  static forRoot(params: {
    /**
     * The root directory to load endpoints from recursively. Relative and absolute
     * paths are supported.
     * If autoLoadEndpoints is false, this is still used to determine the http path
     * for manually loaded endpoints.
     */
    rootDirectory: string;
    /**
     * If true, will automatically load all endpoints in the root directory recursively.
     * Otherwise, you'll need to manually load endpoints into NestJS modules
     * using the `EndpointsModule` decorator.
     * @default false
     */
    autoLoadEndpoints?: boolean;
    imports?: ModuleMetadata['imports'];
    exports?: ModuleMetadata['exports'];
    providers?: ModuleMetadata['providers'];
  }): DynamicModule {
    let rootDirectory = params.rootDirectory;
    if (!path.isAbsolute(rootDirectory)) {
      const calledFrom = callsites()[1]?.getFileName();
      if (!calledFrom) {
        throw new Error('Cannot determine call site');
      }
      rootDirectory = path.join(path.dirname(calledFrom), rootDirectory);
    }
    settings.rootDirectory = rootDirectory;
    let endpoints: Type[] = [];
    if (params.autoLoadEndpoints ?? true) {
      const endopointFiles = findEndpoints(rootDirectory);
      endpoints = endopointFiles.map(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        (f) => require(f).default,
      );
    }
    for (const fn of settings.decorateEndpointFns) {
      fn();
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
