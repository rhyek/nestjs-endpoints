import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { applyDecorators } from '@nestjs/common';
import {
  ApiParam,
  ApiParamOptions,
  ApiQuery,
  ApiQueryOptions,
} from '@nestjs/swagger';
import callsites from 'callsites';
import { z, ZodPipe, ZodTransform } from 'zod';
import { createSchema } from 'zod-openapi';
import { zodToOpenApi } from './zod-to-openapi';

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
  // `/recipes/edit/:recipeId` reads as `recipesEdit(recipeId, body)`
  // instead of `recipesEditRecipeId(recipeId, body)`. The path param is
  // already conveyed by the typed positional argument; repeating its
  // name in the method is just noise.
  return httpPath
    .replace(/\/:[^/]+/g, '')
    .replace(/^:[^/]+\/?/g, '')
    .replace(/^[a-z]/, (letter) => letter.toUpperCase())
    .replace(/[/-]([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

export const ApiQueries = <
  T extends
    | z.ZodObject
    | z.ZodPipe<z.ZodObject>
    | z.ZodPipe<any, z.ZodObject>,
>(
  zodObject: T,
) => {
  const source: z.ZodObject = (() => {
    if (zodObject instanceof ZodPipe) {
      if (zodObject.def.in instanceof ZodTransform) {
        return zodObject.def.out;
      } else {
        return zodObject.def.in;
      }
    }
    return zodObject;
  })();
  const optionsList = Object.keys(source.shape).reduce<
    Array<
      ApiQueryOptions & {
        schema: ReturnType<typeof createSchema>['schema'];
      }
    >
  >((acc, name) => {
    const zodType = source.shape[name];
    if (zodType) {
      const { openApiSchema } = zodToOpenApi({
        schema: zodType,
        schemaType: 'input',
      });
      acc.push({
        name,
        required: !zodType.isOptional(),
        schema: openApiSchema,
      });
    }

    return acc;
  }, []);

  return applyDecorators(
    ...optionsList.map((options) => ApiQuery(options)),
  );
};

export const ApiParams = <
  T extends
    | z.ZodObject
    | z.ZodPipe<z.ZodObject>
    | z.ZodPipe<any, z.ZodObject>,
>(
  zodObject: T,
) => {
  const source: z.ZodObject = (() => {
    if (zodObject instanceof ZodPipe) {
      if (zodObject.def.in instanceof ZodTransform) {
        return zodObject.def.out;
      } else {
        return zodObject.def.in;
      }
    }
    return zodObject;
  })();
  const optionsList = Object.keys(source.shape).reduce<
    Array<
      ApiParamOptions & {
        schema: ReturnType<typeof createSchema>['schema'];
      }
    >
  >((acc, name) => {
    const zodType = source.shape[name];
    if (zodType) {
      const { openApiSchema } = zodToOpenApi({
        schema: zodType,
        schemaType: 'input',
      });
      acc.push({
        name,
        // Path parameters are always required in OpenAPI.
        required: true,
        schema: openApiSchema,
      });
    }
    return acc;
  }, []);

  return applyDecorators(
    ...optionsList.map((options) => ApiParam(options)),
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
  const result = callsite.getFileName()?.replace(/^file:\/\//, '');
  if (!result) {
    throw new Error('Callsite file not found');
  }
  return result;
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
