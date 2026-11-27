import { RequestMethod, type Type, VersioningType } from '@nestjs/common';
// Not re-exported by `@nestjs/common`'s index.
import { MODULE_PATH, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants.js';
import { ApplicationConfig, DiscoveryService, ModulesContainer } from '@nestjs/core';
// Not re-exported by `@nestjs/core`'s index; `@nestjs/swagger` builds the
// document's paths with the same factory.
import { RoutePathFactory } from '@nestjs/core/router/route-path-factory.js';
import type { EndpointKind } from './endpoint-fn';
import type { ObjectConversion } from './object-parameters';
import { sharedState } from './shared-state';
import { toOpenApiPath } from './url-params';
import type { ConvertedSchema, JsonSchema } from './zod-to-openapi';

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
  query?: ObjectConversion;
  namespaceChain: string[];
  tags: string[];
  summary: string;
  /** The `params` object's conversion, when the endpoint declares `params`. */
  params?: ObjectConversion;
  /** The body: a ref to `<operationId>Input`. */
  input?: ConvertedSchema;
  outputs: {
    status: number;
    description?: string;
    schema: ConvertedSchema;
  }[];
};

const { MountedEndpoint } = sharedState;

/** Marks the class of an endpoint a setup has mounted with its descriptor. */
export function mounted(cls: Type, descriptor: EndpointDescriptor): void {
  MountedEndpoint(descriptor)(cls);
}

/** The descriptor of an endpoint a setup has mounted; none for any other class. */
export function descriptorOf(cls: object): EndpointDescriptor | undefined {
  return Reflect.getMetadata(MountedEndpoint.KEY, cls) as EndpointDescriptor | undefined;
}

const requestMethods = {
  get: RequestMethod.GET,
  post: RequestMethod.POST,
  put: RequestMethod.PUT,
  delete: RequestMethod.DELETE,
  patch: RequestMethod.PATCH,
};

/** The HTTP methods an endpoint can declare. */
export type HttpMethod = keyof typeof requestMethods;

/**
 * The descriptors of the endpoints mounted in an app's `modules`, by path then method.
 * Paths are the ones the app serves, built as the OpenAPI document builds
 * them: under the global prefix (unless it excludes the route), the module
 * path a `RouterModule` mounts the module under, and the URI version. An
 * endpoint served under several paths (several URI versions) takes the
 * first. Plain controllers carry no descriptor and are skipped.
 */
export function collectDescriptors(
  modules: ModulesContainer,
  config: ApplicationConfig,
): EndpointDescriptor[] {
  const globalPrefix = config.getGlobalPrefix().replace(/\/$/, '');
  const versioningOptions = config.getVersioning();
  const routePaths = new RoutePathFactory(config);
  const descriptors: EndpointDescriptor[] = [];
  for (const { module, cls, descriptor } of mountedEndpoints(modules)) {
    const modulePath: string | undefined =
      Reflect.getMetadata(MODULE_PATH + modules.applicationId, module.metatype) ??
      Reflect.getMetadata(MODULE_PATH, module.metatype);
    const [routePath] = routePaths.create(
      {
        ctrlPath: Reflect.getMetadata(PATH_METADATA, cls) as string,
        methodPath: '',
        modulePath,
        globalPrefix,
        versioningOptions,
        methodVersion: Reflect.getMetadata(VERSION_METADATA, cls.prototype.handler),
        controllerVersion:
          versioningOptions?.type === VersioningType.URI
            ? (Reflect.getMetadata(VERSION_METADATA, cls) ?? versioningOptions.defaultVersion)
            : undefined,
      },
      requestMethods[descriptor.method],
    );
    // The descriptor's own path is in OpenAPI's form already.
    const path = routePath === undefined ? descriptor.path : toOpenApiPath(routePath);
    descriptors.push({ ...descriptor, path });
  }
  return descriptors.sort((a, b) => compare(a.path, b.path) || compare(a.method, b.method));
}

/**
 * The endpoints mounted in an app's `modules`, each once, with the first module that mounts
 * it: one descriptor per class, as the SDK has one function per operation.
 */
export function* mountedEndpoints(modules: ModulesContainer) {
  const discovery = new DiscoveryService(modules);
  const seen = new Set<unknown>();
  // One wrapper for each module that mounts an endpoint, in the order NestJS scanned them.
  for (const wrapper of discovery.getControllers({ metadataKey: MountedEndpoint.KEY })) {
    const cls = wrapper.metatype as Type;
    const descriptor = discovery.getMetadataByDecorator(MountedEndpoint, wrapper);
    if (descriptor && wrapper.host && !seen.has(cls)) {
      seen.add(cls);
      yield { module: wrapper.host, cls, descriptor };
    }
  }
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
  if (namespaces === undefined) {
    return descriptors;
  }
  const allowed = new Set(namespaces);
  return descriptors.filter((d) => {
    const top = d.namespaceChain[0];
    return top !== undefined && allowed.has(top);
  });
}
