import path from 'node:path';
import { applyDecorators } from '@nestjs/common';
import { ApiQuery, ApiQueryOptions } from '@nestjs/swagger';
import callsites from 'callsites';
import { zodToOpenAPI } from 'nestjs-zod';
import { z, ZodRawShape } from 'zod';

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
  const httpPathPascalName = httpPath
    .replace(/^[a-z]/, (letter) => letter.toUpperCase())
    .replace(/[/-]([a-z])/g, (_, letter: string) => letter.toUpperCase());

  return { httpPath, httpPathPascalName, httpPathSegments: pathSegments };
}

export const ApiQueries = <T extends z.ZodObject<ZodRawShape>>(
  zodObject: T,
) => {
  const optionsList = Object.keys(zodObject.shape).reduce<
    Array<ApiQueryOptions & { schema: ReturnType<typeof zodToOpenAPI> }>
  >((acc, name) => {
    const zodType = zodObject.shape[name];

    if (zodType)
      acc.push({
        name,
        required: !zodType.isOptional(),
        schema: zodToOpenAPI(zodType),
      });

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
