import { findPackageJSON } from 'node:module';
import type { DocumentedSchema } from './document-schemas';

/**
 * `@nestjs/swagger`, or `undefined` in an app that hasn't installed it. Only a package that
 * can't be found counts as not installed: one that is found and fails to load throws here.
 *
 * Whether it is installed is asked of the file system, not of `import.meta.resolve()` or a
 * failed `import()`: those go through the app's module loader, and a loader may report a
 * missing package with an error of its own that names no cause.
 */
async function loadSwagger() {
  try {
    if (!findPackageJSON('@nestjs/swagger', import.meta.url)) {
      return undefined;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      return undefined;
    }
    throw error;
  }
  return import('@nestjs/swagger');
}

// Awaited as this module loads, so that the decorators below exist by the time an endpoint
// is defined.
const swagger = await loadSwagger();

// The decorators that describe an endpoint to `@nestjs/swagger`, for an app that builds an
// OpenAPI document with it. In an app without it there is no document, and they do nothing.
//
// They are typed here, by what the package gives them, so that the package's declarations
// don't name a peer a project may not have installed. Each schema is given as a
// `standardSchema`, which `@nestjs/swagger` takes on all four of the decorators that take a
// schema, though only `ApiResponse`'s options type says so.
const nothing = () => () => {};
type Decorator<Options> = (options: Options) => MethodDecorator;
type Documented = { standardSchema: DocumentedSchema };
type Parameter = Documented & { name: string; required: boolean };

export const ApiOperation = (swagger?.ApiOperation ?? nothing) as Decorator<{
  operationId: string;
  tags: string[];
  summary: string;
}>;
export const ApiExtension = (swagger?.ApiExtension ?? nothing) as (
  key: `x-${string}`,
  value: unknown,
) => MethodDecorator;
export const ApiBody = (swagger?.ApiBody ?? nothing) as Decorator<Documented>;
export const ApiParam = (swagger?.ApiParam ?? nothing) as Decorator<Parameter>;
export const ApiQuery = (swagger?.ApiQuery ?? nothing) as Decorator<
  Parameter & { style?: 'deepObject'; explode?: boolean }
>;
export const ApiResponse = (swagger?.ApiResponse ?? nothing) as Decorator<
  Documented & { status: number; description?: string }
>;
