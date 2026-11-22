---
description: What an endpoint is to the rest of a NestJS app, and how modules, providers, guards, interceptors and adapters apply to it.
---

# How it fits NestJS

nestjs-endpoints is a thin layer over NestJS, not a framework beside it. `endpoint.query()` and
`endpoint.mutation()` return a NestJS controller class, and `NestjsEndpoints.forRoot()` and
`EndpointRouterModule.create()` return a NestJS dynamic module. Everything downstream of those
two facts is NestJS as you know it.

## An endpoint is a controller

Whatever you can do with a controller class, you can do with an endpoint:

```ts
import { Module } from '@nestjs/common';
import { endpoint, z } from 'nestjs-endpoints';

export const healthCheck = endpoint.query({
  path: '/health',
  method: 'get',
  output: z.object({ ok: z.boolean() }),
  handler: () => ({ ok: true }),
});

@Module({
  // listed like any controller, beside the ones you already have
  controllers: [healthCheck, BillingController],
})
export class AppModule {}
```

Most apps let a [router](./routers.md) find their endpoint files instead of listing them, but
the result is the same: controllers registered in a module. See
[Explicit paths](./explicit-paths.md) for endpoints registered by hand.

Each thing a controller says with a decorator is an option of the endpoint. See the
[endpoint options](../reference/endpoint.md#options).

## A router is a module

`NestjsEndpoints.forRoot()`, in the app module, returns the app's root router, and
`EndpointRouterModule.create()` any other one. Each is a dynamic module: import it where you
would import any module, and give the router `providers`, `imports` and `exports` as you would
`@Module()`. An endpoint's providers resolve in the module of the router that owns it. See
[Routers](./routers.md).

## Guards, interceptors, filters and pipes

- **Global ones still apply.** `app.useGlobalGuards()`, `APP_INTERCEPTOR`, `APP_FILTER` and the
  like see endpoints as they see any controller.
- **Per endpoint**, pass method decorators in `decorators`.
- **Per folder**, declare them on the [router](./routers.md).
- **Validation is the endpoint's own.** `input`, `query` and `params` are parsed with their Zod
  schemas, so an endpoint needs no `ValidationPipe`.

## Errors

Throw NestJS's HTTP exceptions from a handler, as you would from a controller method:

```ts
handler: ({ params, orders }) => {
  const order = orders.find(params.orderId);
  if (!order) {
    throw new NotFoundException();
  }
  return order;
},
```

The library's own failures are HTTP exceptions too, so your exception filters can catch them:
a `ZodValidationException` (`400`) when `input`, `query` or `params` fails its schema, and a
`ZodSerializationException` (`500`) when the handler's return value fails `output`. Both carry
the `ZodError`, from `getZodError()`.

## Plain controllers

Endpoints and `@Controller()` classes share an app, its modules and its providers. An
[OpenAPI document](../clients/openapi.md) built with `@nestjs/swagger` covers both, and the
[generated clients](../clients/codegen.md#what-a-client-covers) cover endpoints only.

## HTTP adapters

Express, Fastify, and `node:http` through `@nestjs/platform-node` are supported. Two things
depend on the adapter:

- **Fastify** answers `400` to a request that sends `Content-Type: application/json` with no
  body, before it reaches the endpoint. Send `{}`, or leave the header off.
- **Nested objects in search parameters** (`?add[a]=1&add[b]=2`) need the adapter's extended
  query parser. See the NestJS docs on
  [query parameters](https://docs.nestjs.com/controllers#query-parameters).
