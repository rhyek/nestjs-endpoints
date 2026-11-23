---
description: Every option of endpoint.query() and endpoint.mutation(), and what the handler receives.
---

# Endpoint options

```ts
import { endpoint } from 'nestjs-endpoints';

export default endpoint.query({ /* options */ });
export default endpoint.mutation({ /* options */ });
```

Both builders take the same options and return a NestJS controller class. Use it as a file's
default export for a [router](./router.md) to find, in a router's `endpoints`, or in a module's
`controllers`.

`endpoint.query()` is for reads and `endpoint.mutation()` for writes. The builder decides which
hooks the [React Query client](../clients/react-query.md) generates for the operation.

## Options

| Option | Type | |
| --- | --- | --- |
| `handler` | function | Required. Receives [one object](#the-handler), and returns the response body or a promise of it. |
| `input` | Zod schema | The JSON body. Not allowed with `method: 'get'`. Its `.meta({ description })` describes the request body in an OpenAPI document. |
| `query` | Zod object schema | The search parameters, on any method. |
| `params` | Zod object schema | The path parameters. Its keys must match the `:names` in the URL. |
| `output` | Zod schema, or an object of them by status code | The response body. With a schema per status, the handler returns [`response(status, body)`](../guide/responses.md#several-statuses). A schema's `.meta({ description })` describes its response in an [OpenAPI document](../clients/openapi.md). |
| `method` | `'get' \| 'post' \| 'put' \| 'patch' \| 'delete'` | The HTTP method. Defaults to `'post'`. |
| `path` | `string` | An explicit URL, in place of the one from the file's location. Required for an endpoint [registered by hand](../guide/explicit-paths.md) outside a router. |
| `inject` | object of provider classes or `decorated<T>()` | Providers, as a constructor would inject them. See [Dependency injection](../guide/dependency-injection.md). |
| `injectOnRequest` | object of `decorated<T>()` | Per-request values, as parameter decorators would inject them. |
| `decorators` | `MethodDecorator[]` | Decorators for the handler method, such as `UseGuards(AuthGuard)`. |
| `properties` | function that returns an object | Properties of the endpoint's instance, as a controller's fields are, read from [`this`](#this). The function is called for each instance. A getter or a setter among them stays one, with the instance as its `this`. |
| `methods` | object of functions | Methods of the endpoint's instance, as a controller's are, called on [`this`](#this). |
| `lifecycle` | object of functions: `onModuleInit`, `onApplicationBootstrap`, `onModuleDestroy`, `beforeApplicationShutdown`, `onApplicationShutdown` | [Lifecycle hooks](https://docs.nestjs.com/fundamentals/lifecycle-events), called as a controller's are, with the endpoint's instance as [`this`](#this). An endpoint that NestJS makes for each request cannot declare one, since NestJS calls them only on what it makes once. |
| `summary` | `string` | The operation's summary in an [OpenAPI document](../clients/openapi.md). |
| `tags` | `string[]` | OpenAPI tags, added to the one the operation gets [from its router](../clients/openapi.md#what-an-endpoint-contributes). |

`query` and `params` take an object schema, bare or behind a transform or preprocess step. Anything
else is a type error. The `params` of an endpoint whose
[router declares some](../guide/router-context.md#path-parameters) is a plain `z.object()`.

## The handler

The handler receives one object:

| Key | Present when | Value |
| --- | --- | --- |
| `input` | `input` is declared | The parsed body. |
| `rawInput` | `input` is declared | The body before parsing. |
| `query` | `query` is declared | The parsed search parameters. |
| `params` | `params` is declared, by the endpoint or by [its router](../guide/router-context.md#path-parameters) | The parsed path parameters. |
| `schemas` | always | The Zod schemas: `{ input?, query?, params? }`. |
| `response` | always | `response(status, body)`. Required when `output` has a schema per status. |
| your own keys | | Everything from `inject` and `injectOnRequest`, and from the [router's](../guide/router-context.md), by name. |

## `this`

A handler, a method or a hook in `lifecycle` written as a method, and not as an arrow function, has
the endpoint's instance as `this`:

```ts
export default endpoint.query({
  inject: { users: UsersService },
  input: z.object({ id: z.number() }),
  properties: () => ({ cache: new Map<number, User>() }),
  methods: {
    find(id: number) {
      return this.cache.get(id) ?? this.users.find(id);
    },
  },
  lifecycle: {
    onModuleInit() {
      this.cache.clear();
    },
  },
  handler({ input }) {
    return this.find(input.id);
  },
});
```

`this` has what `inject` gives, the [router's](../guide/router-context.md) included, with the
endpoint's `properties` and `methods`. What a request gives (`input`, `params`, `query` and
`injectOnRequest`) is the handler's argument only. A name is declared once among `inject`,
`properties` and `methods`, and none is `handler`, `invoke` or a lifecycle hook's. Nothing else
in the options has `this`: not the `properties` function itself, and not a router's
`endpoints()`.

TypeScript types `this` under `strict` or `noImplicitThis`.

An endpoint is made for each request when it, or a guard, interceptor, pipe or filter that
applies to it, depends on a request-scoped provider. Its `properties` are then made again for
each request. If it declares a lifecycle hook, the app fails as it starts; in an app with no
router and no `forRoot()`, each request for the endpoint fails.

## Behavior

- An endpoint answers `200`, a `POST` included, unless its handler returns another status with
  `response(status, body)`.
- A request without a body reads as `{}`, unless `input` accepts a missing body.
- `query` and `params` values arrive as strings. Coerce them: `z.coerce.number()`,
  `z.coerce.date()`, and `z.stringbool()` for booleans. `z.coerce.boolean()` reads the string
  `'false'` as `true`.
- An array in `query` takes repeated keys, `?tags=a&tags=b`. A single `?tags=a` reads as a
  one-item array.
- A request that fails `input`, `query` or `params` is answered `400`, with a
  `ZodValidationException`.
- The response is parsed with `output` before it is sent, which strips the keys the schema
  doesn't declare. A return value that fails it is answered `500`, with a
  `ZodSerializationException`.
- Without `output`, the response is sent unvalidated, and the generated client types it as `any`.
- A `null` response is sent as the JSON `null`.

## `invoke()`

Every endpoint class has an `invoke()` method, which runs the endpoint without HTTP. See
[Integration tests](../guide/testing.md#integration-tests).

| Endpoint declares | Call |
| --- | --- |
| No `input`, `query` or `params` | `invoke()` |
| `input` only | `invoke(rawInput)` |
| `query` and/or `params`, without `input` | `invoke({ query, params })` |
| `input`, and `query` and/or `params` | `invoke(rawInput, { query, params })` |

## Helpers

| Export | |
| --- | --- |
| `decorated<T>(decorator)` | Pairs a NestJS property or parameter decorator with the type the handler should see. For `inject` and `injectOnRequest`. |
| `z` | Zod, re-exported. |
