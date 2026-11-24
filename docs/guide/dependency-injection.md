---
description: Inject providers and per-request values into an endpoint's handler, per endpoint or once for a whole router.
---

# Dependency injection

An endpoint takes its dependencies in two maps, which correspond to the two places a NestJS
controller receives them: its constructor, and its method's parameters.

```ts twoslash
// @filename: src/endpoints/orders/$orderId.refund.sample.ts
import { decorated, endpoint, z } from 'nestjs-endpoints';
import { CurrentUser, type User } from '../../auth/current-user.decorator.js';
import { PaymentsService } from '../../payments/payments.service.js';
// ---cut---
// src/endpoints/orders/$orderId.refund.endpoint.ts
//   →  POST /orders/:orderId/refund
export default endpoint.mutation({
  params: z.object({ orderId: z.coerce.number() }),
  input: z.object({ reason: z.string() }),
  output: z.object({ refunded: z.boolean() }),
  // resolved once, as a controller's constructor arguments are
  inject: { payments: PaymentsService },
  // resolved on every request
  injectOnRequest: { user: decorated<User>(CurrentUser()) },
  handler: ({ params, input, payments, user }) =>
    payments.refund(params.orderId, input.reason, user.id),
});
```

Inject what an endpoint works with directly: the database, a queue, a mail client. Write a
service, as `PaymentsService` is here, for domain logic several endpoints share. See
[When to write a service](./architecture.md#services).

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

Register a provider in the `providers` of the [router](./routers.md) that owns the endpoint, or
export it from a module in that router's `imports`. A router made with another's `child()` has
[its parent's](./what-flows-down.md#context) too.

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

## Per-endpoint guards, interceptors and decorators {#per-endpoint-decorators}

`guards` and `interceptors` take what `@UseGuards()` and `@UseInterceptors()` take, classes or
instances, for one endpoint. `decorators` takes any other method decorator, applied to the
endpoint's handler method, such as metadata a guard reads:

```ts
import { SetMetadata } from '@nestjs/common';

export default endpoint.mutation({
  guards: [AdminGuard],
  interceptors: [AuditInterceptor],
  decorators: [SetMetadata('audit', 'refund')],
  // …
});
```

An endpoint's guards run after those of its routers, and its interceptors inside theirs.

For anything a whole folder needs, declare it once on the
[router](./routers.md#middleware-interceptors-and-guards).

## Router injections

What every endpoint of a router needs can be declared once, in the router's `context`. See
[Router context](./router-context.md).
