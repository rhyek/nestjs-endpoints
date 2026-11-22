---
description: What the compiler checks in an endpoint and in the generated client, all inferred from the endpoint's Zod schemas.
---

# Type safety

An endpoint's Zod schemas are the only place its types are written. The handler's arguments, its
return value, the generated client's requests and its responses are all inferred from them, so a
change to a schema is checked everywhere it matters, on the server and in the front end.

Every code sample on this page is compiled against the library when the site is built. The types
and errors shown are the compiler's own. Hover over any name to see its type.

## The handler's arguments

`input`, `query` and `params` reach the handler as the **parsed output** of their schemas:
coerced, defaulted and narrowed.

```ts twoslash
import { endpoint, z } from 'nestjs-endpoints';
// ---cut---
export default endpoint.query({
  params: z.object({ orderId: z.coerce.number() }),
  query: z.object({
    include: z.enum(['items', 'customer']).optional(),
    draft: z.stringbool().default(false),
  }),
  handler: ({ params, query }) => {
    params;
    // ^?
    query;
    // ^?
    return { ok: true };
  },
});
```

`orderId` arrives in the URL as a string and reaches the handler as a `number`. `draft` has a
default, so it is always a `boolean`.

What you [inject](./dependency-injection.md) is typed as well, from the provider's class or from
the type you give `decorated<T>()`:

```ts twoslash
// @filename: src/endpoints/admin/refund.sample.ts
import { decorated, endpoint, z } from 'nestjs-endpoints';
import { CurrentUser, type User } from '../../auth/current-user.decorator.js';
import { PaymentsService } from '../../payments/payments.service.js';
// ---cut---
export default endpoint.mutation({
  input: z.object({ orderId: z.number(), reason: z.string() }),
  inject: { payments: PaymentsService },
  injectOnRequest: { user: decorated<User>(CurrentUser()) },
  handler: ({ input, payments, user }) =>
    //                         ^?
    payments.refund(input.orderId, input.reason, user.id),
});
```

## The return value

The handler's return type is checked against `output`. A value of the wrong shape doesn't
compile:

```ts twoslash
// @errors: 2322
import { endpoint, z } from 'nestjs-endpoints';
// ---cut---
export default endpoint.query({
  params: z.object({ orderId: z.coerce.number() }),
  output: z.object({
    id: z.number(),
    status: z.enum(['pending', 'paid', 'cancelled']),
    total: z.number(),
  }),
  handler: ({ params }) => ({
    id: params.orderId,
    status: 'refunded',
    total: 25,
  }),
});
```

A missing field is an error in the same way.

A return value may carry **more** than `output` declares. Those keys are not a type error: they
are [stripped when the response is parsed](./responses.md#one-response).

### In a block body

In a handler with a block body (`=> { … return … }`), TypeScript reports a wrong value on the
`handler` property, in a long message whose last line names the field
([microsoft/TypeScript#42161](https://github.com/microsoft/TypeScript/issues/42161)). To have
the error on the value, annotate the return type with `z.input` of the schema:

```ts twoslash
// @errors: 2322
import { endpoint, z } from 'nestjs-endpoints';
// ---cut---
const order = z.object({
  id: z.number(),
  status: z.enum(['pending', 'paid', 'cancelled']),
  total: z.number(),
});

export default endpoint.query({
  params: z.object({ orderId: z.coerce.number() }),
  output: order,
  handler: async ({ params }): Promise<z.input<typeof order>> => {
    return { id: params.orderId, status: 'refunded', total: 25 };
  },
});
```

An object literal with a key `output` doesn't declare is then an error too, though a value from
a variable or a call may still carry more.

## Status codes

With a [schema per status](./responses.md#several-statuses), the handler returns
`response(status, body)`. The status must be one `output` declares, and the body is checked
against that status's schema:

```ts twoslash
// @errors: 2322
import { endpoint, z } from 'nestjs-endpoints';
// ---cut---
export default endpoint.mutation({
  input: z.object({ email: z.email() }),
  output: {
    201: z.object({ id: z.number() }),
    409: z.object({ message: z.string() }),
  },
  handler: ({ input, response }) =>
    input.email.endsWith('@example.com')
      ? response(409, { message: 'Already registered' })
      : response(201, { id: 'not-a-number' }),
});
```

Both are arguments of a call, so a mismatch is reported on the value itself, in a block body
too.

## The client

The [generated clients](../clients/codegen.md) are typed from the same schemas. Operations
autocomplete, under the [namespaces](../clients/namespaces.md) your routers declare:

```ts twoslash
// @noErrors
import { createApiClient } from './generated/axios-client.js';
// ---cut---
const client = createApiClient({ baseURL: '/api' });

client.orders.
//            ^|




```

A request that doesn't match the endpoint's schemas doesn't compile:

```ts twoslash
// @errors: 2322 2554
import { createApiClient } from './generated/axios-client.js';
const client = createApiClient({ baseURL: '/api' });
// ---cut---
await client.orders.create({
  body: { productId: 'sku_42', quantity: '2' },
});

await client.orders.view({ path: { orderId: 'first' } });

// a path parameter can't be left out
await client.orders.view();
```

A call resolves to the response with its status, and `data` is the endpoint's `output`:

```ts twoslash
import { createApiClient } from './generated/axios-client.js';
const client = createApiClient({ baseURL: '/api' });
// ---cut---
const result = await client.orders.create({
  body: { productId: 'sku_42', quantity: 2 },
});

result;
// ^?
// the body alone
const order = await client.orders.create({
  body: { productId: 'sku_42', quantity: 2 },
}).unwrap();
```

Comparing a response with a value the server can never send is an error too:

```ts twoslash
// @errors: 2367
import { createApiClient } from './generated/axios-client.js';
const client = createApiClient({ baseURL: '/api' });
const order = await client.orders.view({ path: { orderId: 1 } }).unwrap();
// ---cut---
if (order.status === 'refunded') {
  // …
}
```

The React Query hooks carry the same types. A query's `data` is its `output`, and a mutation's
variables are its request:

```tsx twoslash
// @noErrors
import { useApiClient } from './generated/react-query-client.js';
const orderId = 1;
// ---cut---
const client = useApiClient();
const order = client.orders.useView({ path: { orderId } });

order.data?.
//          ^|





```

```tsx twoslash
// @errors: 2322
import { useApiClient } from './generated/react-query-client.js';
const client = useApiClient();
// ---cut---
const create = client.orders.useCreate();

create.mutate({ body: { productId: 42, quantity: 2 } });
```

## Tests

An endpoint's [`invoke()`](./testing.md#integration-tests) runs it without HTTP, and resolves to
the type of its `output`:

```ts twoslash
import type { INestApplication } from '@nestjs/common';
import createOrder from './src/endpoints/orders/create.endpoint.js';
declare const app: INestApplication;
// ---cut---
const created = await app.get(createOrder).invoke({
  productId: 'sku_42',
  quantity: 2,
});

created;
// ^?
```

## Keeping the client in step

With [`setupCodegen`](../clients/codegen.md) in your `main.ts` and a dev server that restarts
on change, saving an endpoint file regenerates the client, and any caller the change broke shows
up as a type error in the front end.
