import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import type { DynamicModule } from '@nestjs/common';
import callsites from 'callsites';
import { callsiteFileToPath } from './callsite';
import { objectParameters, type ObjectSchemaLike } from './object-parameters';
import { operationName } from './url-params';
import { expandUrlSegment } from './url-segments';

/**
 * An endpoint file's URL: the router's base path, the folders between the
 * file and the root directory it is in (or the working directory), leaving
 * out `_`-prefixed ones, then the file's name unless it is `endpoint.ts`.
 */
export function getEndpointHttpPath(rootDirectories: string[], basePath: string, file: string) {
  const stopDirs = new Set([process.cwd(), ...rootDirectories].map((d) => path.resolve(d)));
  const folderSegments: string[] = [];
  for (
    let dir = path.dirname(file);
    !stopDirs.has(dir) && dir !== path.parse(dir).root;
    dir = path.dirname(dir)
  ) {
    const folder = path.basename(dir);
    if (!folder.startsWith('_')) {
      folderSegments.unshift(...expandUrlSegment(folder));
    }
  }
  const pathSegments = [...basePath.split('/').filter(Boolean), ...folderSegments];
  const basename = path.basename(file, path.extname(file));
  if (basename !== 'endpoint') {
    pathSegments.push(...expandUrlSegment(basename.split('.endpoint')[0]));
  }
  const httpPath = path.posix.join(...pathSegments);
  return {
    httpPath,
    httpPathPascalName: operationName(httpPath),
    httpPathSegments: pathSegments,
  };
}

/** The name of the operation a URL serves: `/recipes/edit/:recipeId` → `RecipesEdit`. */
export const getHttpPathPascalName = operationName;

export const ApiQueries = <T extends ObjectSchemaLike>(zodObject: T) =>
  objectParameters('query', zodObject, 'The schema given to ApiQueries()');

export const ApiParams = <T extends ObjectSchemaLike>(zodObject: T) =>
  objectParameters('path', zodObject, 'The schema given to ApiParams()');

export function getCallsiteFile() {
  const callsite = callsites()[2];
  if (!callsite) {
    throw new Error('Callsite not found');
  }
  const fileName = callsite.getFileName();
  if (!fileName) {
    throw new Error('Callsite file not found');
  }
  return callsiteFileToPath(fileName);
}

export const moduleAls = new AsyncLocalStorage<{
  /** The file that created the parent router. */
  parentRouterFile: string;
  /**
   * The parent router's effective basePath (without leading slash, joined
   * with '/'). Used by nested child routers to prefix their own inferred
   * basePath with the parent's.
   */
  parentBasePath: string;
  /**
   * The directory containing the parent router module file (i.e., the
   * directory in which the parent's `router.ts` lives). Child
   * routers infer their basePath suffix from their own module directory
   * relative to this when they don't sit inside one of the parent's
   * `rootDirectories`.
   */
  parentModuleDir: string;
  /**
   * The parent router's resolved root directories. When a child router's
   * own directory matches (or sits inside) one of these, the basePath
   * suffix is computed relative to that root — preserving the legacy
   * `rootDirectory: './endpoints'` + nested-router pattern.
   */
  parentRootDirectories: string[];
  /**
   * The parent router's effective namespace chain. Child routers that
   * declare their own `namespace` extend this chain; children without a
   * namespace inherit the parent's chain unchanged.
   */
  parentNamespaceChain: string[];
  /**
   * A module that exports nothing, and imports the one with the parent router's lifecycle
   * hooks: what a router under it imports, so that NestJS starts the parent first.
   */
  order?: DynamicModule;
}>();
