---
description: Define an endpoint with endpoint.query() or endpoint.mutation() — its request schemas, HTTP method, output and handler.
---

# Writing an endpoint

Every endpoint is defined with `endpoint.query()` or `endpoint.mutation()`. Both take the same
options and return a NestJS controller class.

```ts twoslash
// @filename: src/endpoints/orders/create.sample.ts
// ---cut---
// src/endpoints/orders/create.endpoint.ts  →  POST /orders/create
import { endpoint, z } from 'nestjs-endpoints';
import { OrdersService } from './orders.service.js';

export default endpoint.mutation({
  input: z.object({
    productId: z.string(),
    quantity: z.number().int().min(1),
  }),
  output: z.object({
    id: z.number(),
    status: z.enum(['pending', 'paid', 'cancelled']),
  }),
  inject: { orders: OrdersService },
  handler: ({ input, orders }) => orders.create(input),
});
```

Use `endpoint.query()` for reads and `endpoint.mutation()` for writes. They serve requests the
same way: the builder decides whether the [React Query client](../clients/react-query.md)
generates a query hook or a mutation hook.

## The request

An endpoint reads a request from up to three places, each with its own schema:

| Option | Reads | In the handler |
| --- | --- | --- |
| `input` | The JSON body | `input` |
| `query` | The search parameters (`?page=2`) | `query` |
| `params` | The path parameters (`/orders/:orderId`) | `params` |

```ts twoslash
// @filename: src/endpoints/orders/list.sample.ts
import { endpoint, z } from 'nestjs-endpoints';
import { orderSchema } from './order.schema.js';
import { OrdersService } from './orders.service.js';
// ---cut---
// src/endpoints/orders/list.endpoint.ts  →  POST /orders/list?page=2
export default endpoint.query({
  query: z.object({ page: z.coerce.number().default(1) }),
  input: z.object({
    status: z.enum(['pending', 'paid', 'cancelled']).optional(),
  }),
  output: z.array(orderSchema),
  inject: { orders: OrdersService },
  handler: ({ query, input, orders }) => orders.list(input.status, query.page),
});
```

- **`query` and `params` values arrive as strings.** Read numbers with `z.coerce.number()`,
  dates with `z.coerce.date()` and booleans with `z.stringbool()`.
- **Path parameters** come from the `$` segments of the file's path. See
  [File-based routing](./file-based-routing.md#path-parameters).
- **A request that fails a schema is answered `400`** with the Zod issues, before the handler
  runs.

## HTTP method

An endpoint is a `POST` unless it sets `method` to `'get'`, `'put'`, `'patch'` or `'delete'`.

Set it for a caller other than the generated client that needs a particular method, such as a
health probe or an OAuth callback that must be a `GET`. The generated client calls every method
the same way, so a delete or an update needs none.

A `GET` carries no body: an endpoint with `method: 'get'` takes `query`, and declaring `input`
on it is a type error.

## The response

`output` is a Zod schema for the response body. The compiler checks the handler's return value
against it, and the response is parsed with it before it is sent. See
[Responses](./responses.md), which also covers answering with several status codes.

## The handler

The handler receives one object: the parsed `input`, `query` and `params`, and everything from
[`inject` and `injectOnRequest`](./dependency-injection.md) under the names you gave them. It
returns the response body, or a promise of it.

See the [endpoint options reference](../reference/endpoint.md) for every option and everything
the handler receives.
