import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { applyDecorators } from '@nestjs/common';
import { ApiQuery, ApiQueryOptions } from '@nestjs/swagger';
import callsites from 'callsites';
import { z, ZodRawShape } from 'zod';
import { createSchema } from 'zod-openapi';
import { zodToOpenApi } from './zod-to-openapi';

function isDirPathSegment(dir: string) {
  const segment = path.basename(dir);
  if (!segment.startsWith('_')) {
    return true;
  }
  return false;
}
const shortCircuitDirs: Record<string, boolean> = {
  [process.cwd()]: true,
};
export function getEndpointHttpPath(
  rootDirectory: string,
  basePath: string,
  file: string,
) {
  shortCircuitDirs[rootDirectory] = true;
  let pathSegments: string[] = [];
  let start = path.dirname(file);
  let lastDirPathSegment: string | null = null;

  while (true) {
    if (
      Object.keys(shortCircuitDirs).some(
        (d) =>
          path.normalize(d + path.sep) ===
          path.normalize(start + path.sep),
      ) ||
      start === path.parse(start).root
    ) {
      break;
    }
    if (isDirPathSegment(start)) {
      pathSegments.push(path.basename(start));
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
    pathSegments.push(leaf);
  }
  const httpPath = path.join(...pathSegments);
  const httpPathPascalName = getHttpPathPascalName(httpPath);

  return { httpPath, httpPathPascalName, httpPathSegments: pathSegments };
}

export function getHttpPathPascalName(httpPath: string) {
  return httpPath
    .replace(/^[a-z]/, (letter) => letter.toUpperCase())
    .replace(/[/-]([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export const ApiQueries = <T extends z.ZodObject<ZodRawShape>>(
  zodObject: T,
) => {
  const optionsList = Object.keys(zodObject.shape).reduce<
    Array<
      ApiQueryOptions & {
        schema: ReturnType<typeof createSchema>['schema'];
      }
    >
  >((acc, name) => {
    const zodType = zodObject.shape[name];
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

export const moduleAls = new AsyncLocalStorage<boolean>();
