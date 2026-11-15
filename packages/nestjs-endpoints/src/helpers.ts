import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import callsites from 'callsites';
import { callsiteFileToPath } from './callsite.js';
import { objectParameters, type ObjectSchemaLike } from './object-parameters.js';

/**
 * Expand one filename-derived path segment into one or more URL segments.
 *
 * - Splits on `.` so `$id.view` → `[$id, view]` and `$id.delete` →
 *   `[$id, delete]`. This is what lets a single folder or file express a
 *   URL with a path parameter inline (e.g., `recipes/$id.delete.endpoint.ts`
 *   → `recipes/:id/delete`).
 * - Subsegments starting with `$` become `:` parameters: `$id` → `:id`.
 *
 * Empty pieces are dropped, which gracefully handles oddities like a
 * leading or trailing `.`.
 */
function expandUrlSegment(segment: string): string[] {
  return segment
    .split('.')
    .filter(Boolean)
    .map((sub) => (sub.startsWith('$') ? ':' + sub.slice(1) : sub));
}

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
    httpPathPascalName: getHttpPathPascalName(httpPath),
    httpPathSegments: pathSegments,
  };
}

export function getHttpPathPascalName(httpPath: string) {
  // Drop entire `:param` segments from the name so the SDK method for
  // `/recipes/edit/:recipeId` reads as `recipesEdit({ path, body })`
  // instead of `recipesEditRecipeId({ path, body })`. The path param is
  // already conveyed by the typed `path` group; repeating its name in the
  // method is just noise.
  return httpPath
    .replace(/\/:[^/]+/g, '')
    .replace(/^:[^/]+\/?/g, '')
    .replace(/^[a-z]/, (letter) => letter.toUpperCase())
    .replace(/[/-]([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

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
  /**
   * The parent router's effective basePath (without leading slash, joined
   * with '/'). Used by nested child routers to prefix their own inferred
   * basePath with the parent's.
   */
  parentBasePath: string;
  /**
   * The directory containing the parent router module file (i.e., the
   * directory in which the parent's `router.module.ts` lives). Child
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
}>();
