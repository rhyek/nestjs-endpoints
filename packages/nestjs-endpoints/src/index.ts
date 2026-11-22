export { z } from 'zod';
export {
  endpoint,
  decorated,
  schema,
  EndpointResponse,
  type EndpointBuilder,
  type EndpointBuilders,
} from './endpoint-fn';
export { ZodValidationException, ZodSerializationException } from './exceptions';
export * from './helpers';
export { setupCodegen } from './codegen/setup';
export {
  EndpointRouterModule,
  // eslint-disable-next-line typescript/no-deprecated -- the alias itself, still exported
  EndpointsRouterModule,
  type EndpointRouter,
} from './endpoint-router.module';
export { NestjsEndpoints, type NestjsEndpointsOptions } from './nestjs-endpoints';
