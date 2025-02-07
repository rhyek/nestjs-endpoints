import fs from 'node:fs';
import path from 'node:path';
import { applyDecorators } from '@nestjs/common';
import { ApiQuery, ApiQueryOptions } from '@nestjs/swagger';
import { zodToOpenAPI } from 'nestjs-zod';
import callsites from 'callsites';
import { z, ZodRawShape } from 'zod';

const isDirPathSegmentCache = new Map<string, boolean>();
function isDirPathSegment(dir: string) {
  if (isDirPathSegmentCache.has(dir)) {
    return isDirPathSegmentCache.get(dir)!;
  }
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f.match(/module\.[^/.]+$/)) {
      const file = path.join(dir, f);
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('EndpointsModule')) {
        isDirPathSegmentCache.set(dir, true);
        return true;
      }
    }
  }
  isDirPathSegmentCache.set(dir, false);
  return false;
}
const shortCircuitDirs: Record<string, boolean> = {};
export function getEndpointHttpPath() {
  const file = callsites()
    .map((callsite) => {
      const fileName = callsite.getFileName();
      if (!fileName || fileName.includes('node_modules')) {
        return null;
      }
      return fileName.replace(/^file:\/\//, '');
    })
    .find((f) => f && f.match(/\.endpoint\.[^/.]+$/));
  if (!file) {
    throw new Error('Endpoint file not found');
  }

  const pathSegments: string[] = [];
  let start = path.dirname(file);
  let lastDirPathSegment: string | null = null;
  while (true) {
    if (shortCircuitDirs[start] || start === path.parse(start).root) {
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
  pathSegments.reverse();

  const leaf = path.basename(file, path.extname(file)).split('.endpoint')[0];
  pathSegments.push(leaf);
  const httpPath = path.join(...pathSegments);

  const httpPathPascalName = httpPath
    .replace(/^[a-z]/, (letter) => letter.toUpperCase())
    .replace(/[/-]([a-z])/g, (_, letter: string) => letter.toUpperCase());

  return { httpPath, httpPathPascalName, httpPathSegments: pathSegments };
}

export const ApiQueries = <T extends z.ZodObject<ZodRawShape>>(
  zodObject: T
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

  return applyDecorators(...optionsList.map((options) => ApiQuery(options)));
};

export function shouldJson(value: any) {
  return typeof value !== 'string';
}
