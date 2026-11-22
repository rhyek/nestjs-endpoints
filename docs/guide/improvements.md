---
description: What nestjs-endpoints adds to NestJS itself — guards, interceptors and middleware scoped to a router module, faster schema validation, and responses the compiler checks.
---

# Improvements on NestJS

nestjs-endpoints is [built on NestJS](./nestjs.md), and most of what it does is save you
writing. A few things it does are ones NestJS doesn't do at all.

## Guards, interceptors and middleware scoped to a router module

In NestJS, a guard or an interceptor is either global (`APP_GUARD`, `APP_INTERCEPTOR`) or
repeated on every controller it should cover. There is no way to say "everything in this
module". A new controller that is added without the decorator is unguarded, and nothing tells
you.

A router module declares them once, for every <Endpoint>endpoint</Endpoint> it owns, nested routers
included:

```ts
// src/endpoints/admin/router.module.ts
import { EndpointRouterModule } from 'nestjs-endpoints';

export default EndpointRouterModule.create({
  providers: [AdminGuard],
  guards: [AdminGuard],
  interceptors: [AuditInterceptor],
  middleware: [RequestIdMiddleware],
});
```

An endpoint file added under `admin/` belongs to that router, so it is guarded without a
decorator of its own. See
[Middleware, interceptors and guards](./routers.md#middleware-interceptors-and-guards).

## Faster schema validation

An <Endpoint>endpoint</Endpoint> validates its request and its response in one step, without the
pipe and the interceptor NestJS's own schema validation runs. The same API serves about 25% more
requests per second where both are validated. See [Performance](./performance.md).

## Responses the compiler checks

NestJS validates a response when the request runs. An <Endpoint>endpoint</Endpoint>'s return value
is also checked against `output` by the compiler, so a handler that returns the wrong shape doesn't
build. See [Type safety](./type-safety.md#the-return-value).
