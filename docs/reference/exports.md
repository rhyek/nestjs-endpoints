---
description: What the nestjs-endpoints package exports.
---

# Exports

Everything is exported from the package's root:

```ts
import {
  endpoint,
  decorated,
  schema,
  z,
  NestjsEndpoints,
  EndpointRouterModule,
  setupCodegen,
  EndpointResponse,
  ZodValidationException,
  ZodSerializationException,
} from 'nestjs-endpoints';
```

## Endpoints

| Export | |
| --- | --- |
| [`endpoint`](./endpoint.md) | `endpoint.query()` and `endpoint.mutation()`. Each returns a NestJS controller class. |
| [`decorated`](../guide/dependency-injection.md) | Pairs a NestJS decorator with a TypeScript type, for `inject` and `injectOnRequest`. |
| [`schema`](../guide/responses.md#several-statuses) | Attaches an OpenAPI description to a Zod schema. |
| `z` | Zod, re-exported. |
| `EndpointResponse` | What `response(status, body)` returns, and what `invoke()` resolves to for an endpoint with several statuses. |

## Routers

| Export | |
| --- | --- |
| [`NestjsEndpoints`](./router.md#nestjsendpoints-forroot) | `NestjsEndpoints.forRoot()` sets the library up in the app's root module, and makes its root router. |
| [`EndpointRouterModule`](./router.md#endpointroutermodule-create) | `EndpointRouterModule.create()` makes any other router. |

## Clients

| Export | |
| --- | --- |
| [`setupCodegen`](../clients/codegen.md) | Generates the axios and React Query clients. |

## Exceptions

| Export | |
| --- | --- |
| `ZodValidationException` | Thrown when `input`, `query` or `params` fails its schema. A `BadRequestException`, answered `400`. |
| `ZodSerializationException` | Thrown when a return value fails `output`. An `InternalServerErrorException`, answered `500`. |

Both have a `getZodError()` method, which returns the `ZodError`.

## Types

| Export | |
| --- | --- |
| `NestjsEndpointsOptions` | The options of `NestjsEndpoints.forRoot()`. |
| `EndpointRouter` | What `NestjsEndpoints.forRoot()` and `EndpointRouterModule.create()` return. |
| `EndpointBuilder`, `EndpointBuilders` | The types of `endpoint.query` and of `endpoint` itself. |

## OpenAPI helpers

| Export | |
| --- | --- |
| `ApiQueries`, `ApiParams` | Decorators that document a Zod object schema as query or path parameters. Endpoints apply them for you, so they are rarely needed directly. Without `@nestjs/swagger` installed they do nothing. |

## Deprecated names

These still work. Use the current name in new code:

| Deprecated | Use |
| --- | --- |
| `EndpointsRouterModule` | `EndpointRouterModule` |
| `EndpointsRouterModule.register()` | `EndpointRouterModule.create()` |
| `injectMethod`, `injectAtRequest` | `injectOnRequest` |
