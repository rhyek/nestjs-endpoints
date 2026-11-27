---
description: What the nestjs-endpoints package exports.
---

# Exports

Everything is exported from the package's root:

```ts
import {
  endpoint,
  decorated,
  z,
  NestjsEndpoints,
  EndpointRouter,
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
| `z` | Zod, re-exported. |
| `EndpointResponse` | What `response(status, body)` returns, and what `invoke()` resolves to for an endpoint with several statuses. |

## Routers

| Export | |
| --- | --- |
| [`NestjsEndpoints`](./router.md#nestjsendpoints-forroot) | `NestjsEndpoints.forRoot()` sets the library up in the app's root module, and makes its root router. |
| [`EndpointRouter`](./router.md#endpointrouter-create) | `EndpointRouter.create()` makes any other router. |

## Clients

| Export | |
| --- | --- |
| [`setupCodegen`](../clients/codegen.md#a-global-prefix-or-versioning) | Writes an app's clients from a script: those its `forRoot` declares, or those it is given. |

## Exceptions

| Export | |
| --- | --- |
| `ZodValidationException` | Thrown when `params`, `query` or `input` fails its schema. A `BadRequestException`, answered `400`. |
| `ZodSerializationException` | Thrown when a return value fails `output`. An `InternalServerErrorException`, answered `500`. |

Both have a `getZodError()` method, which returns the `ZodError`.

## Types

| Export | |
| --- | --- |
| `NestjsEndpointsOptions` | The options of `NestjsEndpoints.forRoot()`. |
| `ClientOptions` | One [client](../clients/codegen.md#set-it-up): an entry of `clients`. |
| `ClientsOption` | What `clients` takes: a list of clients, or a function that returns one or a promise of one. |
| `EndpointRouterOptions` | The [options](./router.md#options) of a router: what `EndpointRouter.create()`, `child()` and the `router` of `forRoot()` take. |
| `EndpointRouter` | A router: what `NestjsEndpoints.forRoot()`, `EndpointRouter.create()` and a router's `child()` return. |
| `ListedRouter`, `RegisteredRouter` | An entry of a router's [`routers`](../guide/routers.md#a-router-from-another-package), and what a router's `register()` returns. |
| `EndpointBuilder`, `EndpointBuilders` | The types of `endpoint.query` and of `endpoint` itself. |

## OpenAPI helpers

| Export | |
| --- | --- |
| `ApiParams`, `ApiQueries` | Decorators that document a Zod object schema as path or query parameters. Endpoints apply them for you. Without `@nestjs/swagger` installed they do nothing. |

## Deprecated names

Aliases of a current name. Use the current name in new code:

| Deprecated | Use |
| --- | --- |
| `injectMethod`, `injectAtRequest` | `injectOnRequest` |
