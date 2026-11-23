---
description: Inject providers and per-request values into an endpoint's handler, per endpoint or once for a whole router.
---

# Dependency injection

An endpoint takes its dependencies in two maps, which correspond to the two places a NestJS
controller receives them: its constructor, and its method's parameters.

```ts twoslash
// @filename: src/endpoints/admin/refund.sample.ts
import { decorated, endpoint, z } from 'nestjs-endpoints';
import { CurrentUser, type User } from '../../auth/current-user.decorator.js';
import { PaymentsService } from '../../payments/payments.service.js';
// ---cut---
export default endpoint.mutation({
  input: z.object({ orderId: z.number(), reason: z.string() }),
  output: z.object({ refunded: z.boolean() }),
  // resolved once, as a controller's constructor arguments are
  inject: { payments: PaymentsService },
  // resolved on every request
  injectOnRequest: { user: decorated<User>(CurrentUser()) },
  handler: ({ input, payments, user }) =>
    payments.refund(input.orderId, input.reason, user.id),
});
```

Each key becomes an argument of the handler, under the name you gave it, with its type.

## `inject`: providers

`inject` is constructor injection. Each value is a provider's class, and the handler receives
its instance.

A provider registered under a token that is not a class needs `decorated<T>()`, which pairs
NestJS's `@Inject()` with the type the handler should see:

```ts
import { Inject } from '@nestjs/common';
import { decorated, endpoint } from 'nestjs-endpoints';

export default endpoint.query({
  inject: {
    db: DbService,
    orders: decorated<OrderRepository>(Inject(ORDER_REPOSITORY)),
  },
  handler: ({ db, orders }) => {
    // …
  },
});
```

A provider must be resolvable in the module the endpoint lands in. Add it to the `providers` of
the [router](./routers.md) that owns the endpoint, or export it from a module in that router's
`imports`. A router made with another's `child()` has
[its parent's](./router-context.md#providers) too.

## `injectOnRequest`: per-request values

`injectOnRequest` is parameter injection. Each value is a NestJS parameter decorator, wrapped in
`decorated<T>()` to give it a type:

```ts
injectOnRequest: {
  req: decorated<Request>(Req()),
  session: decorated<SessionData>(Session()),
  // your own, made with createParamDecorator()
  user: decorated<User>(CurrentUser()),
}
```

## Per-endpoint decorators

`decorators` takes method decorators, applied to the endpoint's handler method. Use it for a
guard, an interceptor or metadata that one endpoint needs:

```ts
import { UseGuards } from '@nestjs/common';

export default endpoint.mutation({
  decorators: [UseGuards(AdminGuard)],
  // …
});
```

For anything a whole folder needs, declare it once on the
[router](./routers.md#middleware-interceptors-and-guards).

## Router injections

What every endpoint of a router needs can be declared once, in the router's `context`, with its
`inject` and `injectOnRequest`. See [Router context](./router-context.md).
