---
description: Give an endpoint its own state, helper methods and NestJS lifecycle hooks with properties, methods and lifecycle, and reach them from this.
---

# State and lifecycle

An endpoint is a class NestJS makes once, as it does a controller, so it can keep state between
requests, split its work into methods, and run code as the app starts and stops, with
`properties`, `methods` and `lifecycle`.

```ts twoslash
// @filename: src/endpoints/products/$productId.price.sample.ts
import { endpoint, z } from 'nestjs-endpoints';
import { DbService } from '../../db/db.service.js';
import { products } from '../../db/schema.js';
// ---cut---
// src/endpoints/products/$productId.price.endpoint.ts
export default endpoint.query({
  params: z.object({ productId: z.string() }),
  output: z.object({ price: z.number().nullable() }),
  inject: { db: DbService },
  properties: () => ({ prices: new Map<string, number>() }),
  methods: {
    async load() {
      const rows = await this.db.select().from(products);
      this.prices = new Map(
        rows.map((row) => [row.id, row.price]),
      );
    },
  },
  lifecycle: {
    async onApplicationBootstrap() {
      await this.load();
    },
  },
  handler({ params }) {
    return { price: this.prices.get(params.productId) ?? null };
  },
});
```

## Properties

`properties` is a function that returns the endpoint's fields, as a controller's are. It is
called once for each instance NestJS makes, so every instance has its own.

```ts
properties: () => ({
  hits: 0,
  startedAt: new Date(),
}),
```

## Methods

`methods` are the endpoint's methods. They call each other and read the properties through
`this`.

```ts
methods: {
  isStale() {
    return Date.now() - this.startedAt.getTime() > 60_000;
  },
},
```

## Lifecycle hooks

`lifecycle` takes NestJS's [lifecycle hooks](https://docs.nestjs.com/fundamentals/lifecycle-events),
called as a controller's are:

| Hook | Called |
| --- | --- |
| `onModuleInit` | Once the endpoint's module has its dependencies. |
| `onApplicationBootstrap` | Once every module has started. |
| `onModuleDestroy` | When the app is told to stop. |
| `beforeApplicationShutdown` | Before connections close. |
| `onApplicationShutdown` | After connections close. |

The three shutdown hooks run only when the app has
[shutdown hooks enabled](https://docs.nestjs.com/fundamentals/lifecycle-events#application-shutdown)
or is closed with `app.close()`.

## `this`

A handler, a method or a hook written as a method, and not as an arrow function, has the
endpoint's instance as `this`:

| On `this` | From |
| --- | --- |
| Providers | `inject`, the endpoint's and its [router's](./router-context.md) |
| Fields | `properties` |
| Methods | `methods` |

What a request gives stays in the handler's argument: `params`, `query`, `input` and everything
from `injectOnRequest`. TypeScript types `this` under `strict` or `noImplicitThis`.

## An endpoint made for each request

NestJS makes an endpoint again for each request when it, or a guard, interceptor, pipe or filter
of its own or of the app's, depends on a request-scoped provider. Its `properties` are then made
for each request too, so they hold nothing between requests. A router's guard or interceptor
that does is made for each request itself, and the endpoints under it once.

## On a router

A router takes the same three options, for code that belongs to a whole folder. See
[A router's own hooks and state](./routers.md#own).
