export { z } from 'zod';
export {
  endpoint,
  decorated,
  schema,
  EndpointResponse,
  type EndpointBuilder,
  type EndpointBuilders,
} from './endpoint-fn.js';
export { ZodValidationException, ZodSerializationException } from './exceptions.js';
export * from './helpers.js';
export * from './setup-openapi.js';
export * from './codegen/index.js';
export {
  EndpointRouterModule,
  // eslint-disable-next-line typescript/no-deprecated -- the alias itself, still exported
  EndpointsRouterModule,
  type EndpointRouter,
} from './endpoint-router.module.js';
export { registerEndpointManifest, type EndpointManifestDefinition } from './manifest/registry.js';
