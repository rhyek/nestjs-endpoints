import { RequestMethod, VersioningType } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
// Not re-exported by `@nestjs/common`'s index.
import {
  MODULE_PATH,
  VERSION_METADATA,
} from '@nestjs/common/constants.js';
import { ApplicationConfig, ModulesContainer } from '@nestjs/core';
// Not re-exported by `@nestjs/core`'s index; `@nestjs/swagger` builds the
// document's paths with the same factory.
import { RoutePathFactory } from '@nestjs/core/router/route-path-factory.js';
import type { HttpMethod } from './codegen/http-methods.js';
import type { EndpointKind } from './endpoint-fn.js';
import type { JsonSchema } from './zod-to-openapi.js';

/** One `toJsonSchema` result: the schema and the components it names. */
export type ConvertedSchema = {
  json: JsonSchema;
  components: Record<string, JsonSchema>;
};

/** What an endpoint's setup knows about it, for codegen to read. */
export type EndpointDescriptor = {
  operationId: string;
  /** Which builder defined it: `endpoint.query()` or `endpoint.mutation()`. */
  kind: EndpointKind;
  method: HttpMethod;
  /**
   * In `{param}` notation: `/recipes/{recipeId}/view`. `collectDescriptors`
   * adds the app's global prefix, a `RouterModule` module path and the URI
   * version.
   */
  path: string;
  /** The path's `{param}`s in order, typed by `params`, else strings. */
  pathParams: { name: string; schema: JsonSchema }[];
  /**
   * The `query` object's conversion (a ref when it has a `.meta({ id })`),
   * and its search parameters, one per property.
   */
  query?: ConvertedSchema & {
    parameters: { name: string; required: boolean; schema: JsonSchema }[];
  };
  namespaceChain: string[];
  tags: string[];
  summary: string;
  /** The `params` object's conversion, when the endpoint declares `params`. */
  params?: ConvertedSchema;
  /** The body: a ref to `<operationId>Input`. */
  input?: ConvertedSchema;
  outputs: {
    status: number;
    description?: string;
    schema: ConvertedSchema;
  }[];
};

export const DESCRIPTOR_METADATA_KEY = 'endpoints:descriptor';

/** `/recipes/:recipeId/view` → `/recipes/{recipeId}/view`. */
export function toOpenApiPath(httpPath: string): string {
  return httpPath
    .split('/')
    .map((segment) =>
      segment.startsWith(':') ? `{${segment.slice(1)}}` : segment,
    )
    .join('/');
}

const requestMethods: Record<HttpMethod, RequestMethod | undefined> = {
  get: RequestMethod.GET,
  post: RequestMethod.POST,
  put: RequestMethod.PUT,
  delete: RequestMethod.DELETE,
  patch: RequestMethod.PATCH,
  head: RequestMethod.HEAD,
  options: RequestMethod.OPTIONS,
  trace: undefined,
};

/**
 * The descriptors of the endpoints mounted in `app`, by path then method.
 * Paths are the ones the app serves, built as the OpenAPI document builds
 * them: under the global prefix (unless it excludes the route), the module
 * path a `RouterModule` mounts the module under, and the URI version. An
 * endpoint served under several paths (several URI versions) takes the
 * first. Plain controllers carry no descriptor and are skipped.
 */
export function collectDescriptors(
  app: INestApplicationContext,
): EndpointDescriptor[] {
  const modules = app.get(ModulesContainer);
  const config = app.get(ApplicationConfig);
  const globalPrefix = config.getGlobalPrefix().replace(/\/$/, '');
  const versioningOptions = config.getVersioning();
  const routePaths = new RoutePathFactory(config);
  // One descriptor per class, as the SDK has one function per operation.
  const descriptors = new Map<unknown, EndpointDescriptor>();
  for (const module of modules.values()) {
    const modulePath: string | undefined =
      Reflect.getMetadata(
        MODULE_PATH + modules.applicationId,
        module.metatype,
      ) ?? Reflect.getMetadata(MODULE_PATH, module.metatype);
    for (const { metatype: cls } of module.controllers.values()) {
      if (typeof cls !== 'function' || descriptors.has(cls)) continue;
      const descriptor: EndpointDescriptor | undefined =
        Reflect.getMetadata(DESCRIPTOR_METADATA_KEY, cls);
      if (!descriptor) continue;
      const [routePath] = routePaths.create(
        {
          ctrlPath: Reflect.getMetadata('endpoints:path', cls) as string,
          methodPath: '',
          modulePath,
          globalPrefix,
          versioningOptions,
          methodVersion: Reflect.getMetadata(
            VERSION_METADATA,
            cls.prototype.handler,
          ),
          controllerVersion:
            versioningOptions?.type === VersioningType.URI
              ? (Reflect.getMetadata(VERSION_METADATA, cls) ??
                versioningOptions.defaultVersion)
              : undefined,
        },
        requestMethods[descriptor.method],
      );
      const path = toOpenApiPath(routePath ?? descriptor.path);
      descriptors.set(cls, { ...descriptor, path });
    }
  }
  return [...descriptors.values()].sort(
    (a, b) => compare(a.path, b.path) || compare(a.method, b.method),
  );
}

function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The descriptors whose top-level namespace is in `namespaces`; all of them
 * when `namespaces` is `undefined`.
 */
export function filterDescriptors(
  descriptors: EndpointDescriptor[],
  namespaces: string[] | undefined,
): EndpointDescriptor[] {
  if (namespaces === undefined) return descriptors;
  const allowed = new Set(namespaces);
  return descriptors.filter((d) => {
    const top = d.namespaceChain[0];
    return top !== undefined && allowed.has(top);
  });
}
