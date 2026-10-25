import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { applyDecorators } from '@nestjs/common';
import { ApiParam, ApiQuery } from '@nestjs/swagger';
import callsites from 'callsites';
import { callsiteFileToPath } from './callsite.js';
import {
  convertObject,
  type ObjectSchemaLike,
} from './object-parameters.js';
import { registerComponents } from './zod-to-openapi.js';

function isDirPathSegment(dir: string) {
  const segment = path.basename(dir);
  if (!segment.startsWith('_')) {
    return true;
  }
  return false;
}
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
const shortCircuitDirs: Record<string, boolean> = {
  [process.cwd()]: true,
};
export function getEndpointHttpPath(
  rootDirectories: string[],
  basePath: string,
  file: string,
) {
  const stopDirs: Record<string, boolean> = { ...shortCircuitDirs };
  for (const d of rootDirectories) {
    stopDirs[d] = true;
  }
  // Folder segments are collected leaf-to-root, then reversed at the end.
  // To keep `$id.view` (one folder) producing `:id/view` (in that order)
  // after the final reverse, push its expansion in reverse here so the
  // outer reverse restores root-to-leaf order across both folders and the
  // subsegments of any one folder.
  let pathSegments: string[] = [];
  let start = path.dirname(file);
  let lastDirPathSegment: string | null = null;

  while (true) {
    if (
      Object.keys(stopDirs).some(
        (d) =>
          path.normalize(d + path.sep) ===
          path.normalize(start + path.sep),
      ) ||
      start === path.parse(start).root
    ) {
      break;
    }
    if (isDirPathSegment(start)) {
      const expanded = expandUrlSegment(path.basename(start));
      for (let i = expanded.length - 1; i >= 0; i--) {
        pathSegments.push(expanded[i]);
      }
      lastDirPathSegment = start;
    }
    start = path.dirname(start);
  }
  if (lastDirPathSegment) {
    shortCircuitDirs[path.dirname(lastDirPathSegment)] = true;
  }
  const basePathSegments = basePath.split('/').filter(Boolean);
  pathSegments = [...basePathSegments, ...pathSegments.reverse()];

  const basename = path.basename(file, path.extname(file));
  if (basename !== 'endpoint') {
    const leaf = basename.split('.endpoint')[0];
    pathSegments.push(...expandUrlSegment(leaf));
  }
  const httpPath = path.join(...pathSegments);
  const httpPathPascalName = getHttpPathPascalName(httpPath);

  return { httpPath, httpPathPascalName, httpPathSegments: pathSegments };
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

export const ApiQueries = <T extends ObjectSchemaLike>(zodObject: T) => {
  const { parameters, components } = convertObject(
    zodObject,
    'The schema given to ApiQueries()',
  );
  registerComponents(components);
  return applyDecorators(
    ...parameters.map((p) =>
      ApiQuery({ name: p.name, required: p.required, schema: p.schema }),
    ),
  );
};

export const ApiParams = <T extends ObjectSchemaLike>(zodObject: T) => {
  const { parameters, components } = convertObject(
    zodObject,
    'The schema given to ApiParams()',
  );
  registerComponents(components);
  return applyDecorators(
    ...parameters.map((p) =>
      // Path parameters are always required in OpenAPI.
      ApiParam({ name: p.name, required: true, schema: p.schema }),
    ),
  );
};

export function shouldJson(value: unknown) {
  return typeof value !== 'string';
}

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
