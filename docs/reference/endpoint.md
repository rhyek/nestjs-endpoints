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
| `input` | Zod schema | The JSON body. Not allowed with `method: 'get'`. |
| `query` | Zod object schema | The search parameters, on any method. |
| `params` | Zod object schema | The path parameters. Its keys must match the `:names` in the URL. |
| `output` | Zod schema, or an object of them by status code | The response body. With a schema per status, the handler returns [`response(status, body)`](../guide/responses.md#several-statuses). |
| `method` | `'get' \| 'post' \| 'put' \| 'patch' \| 'delete'` | The HTTP method. Defaults to `'post'`. |
| `path` | `string` | An explicit URL, in place of the one from the file's location. Required for an endpoint [registered by hand](../guide/explicit-paths.md) outside a router. |
| `inject` | object of provider classes or `decorated<T>()` | Providers, as a constructor would inject them. See [Dependency injection](../guide/dependency-injection.md). |
| `injectOnRequest` | object of `decorated<T>()` | Per-request values, as parameter decorators would inject them. |
| `decorators` | `MethodDecorator[]` | Decorators for the handler method, such as `UseGuards(AuthGuard)`. |
| `summary` | `string` | The operation's summary in an [OpenAPI document](../clients/openapi.md). |
| `tags` | `string[]` | OpenAPI tags, added to the one the operation gets [from its router](../clients/openapi.md#what-an-endpoint-contributes). |

`query` and `params` take an object schema: bare, behind a transform or preprocess step, or
given through `schema()`. Anything else is a type error.

## The handler

The handler receives one object:

| Key | Present when | Value |
| --- | --- | --- |
| `input` | `input` is declared | The parsed body. |
| `rawInput` | `input` is declared | The body before parsing. |
| `query` | `query` is declared | The parsed search parameters. |
| `params` | `params` is declared | The parsed path parameters. |
| `schemas` | always | The Zod schemas: `{ input?, query?, params? }`. |
| `response` | always | `response(status, body)`. Required when `output` has a schema per status. |
| your own keys | | Everything from `inject` and `injectOnRequest`, and from the [router's injections](../guide/routers.md#shared-injections), by name. |

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
| `schema(zodSchema, { description })` | Attaches an OpenAPI description to a schema. Accepted wherever a schema is, and shown for `output`. |
| `z` | Zod, re-exported. |
