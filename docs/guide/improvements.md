---
description: What nestjs-endpoints adds to NestJS itself — guards, interceptors and middleware scoped to a router, path parameters and injections declared once for a folder, validation that gives each schema only its own value and runs faster, and responses the compiler checks.
---

# Improvements on NestJS

nestjs-endpoints is [built on NestJS](./nestjs.md), and most of what it does is save you
writing. A few things it does are ones NestJS doesn't do at all.

## Guards, interceptors and middleware scoped to a router

In NestJS, a guard or an interceptor is global or repeated on each controller, so a controller
added without the decorator is unguarded. A router declares them once, for every
<Endpoint>endpoint</Endpoint> it owns, nested routers included:

```ts
// src/endpoints/admin/router.ts
import { EndpointRouter } from 'nestjs-endpoints';

export default EndpointRouter.create({
  providers: [AdminGuard],
  guards: [AdminGuard],
  interceptors: [AuditInterceptor],
  middleware: [RequestIdMiddleware],
});
```

An endpoint file added under `admin/` is guarded without a decorator of its own. See
[Middleware, interceptors and guards](./routers.md#middleware-interceptors-and-guards).

## Path parameters and injections declared once for a folder

In NestJS, every controller injects its own providers, and every handler declares and validates
its own `@Param()`, however many of them share a URL prefix. A router declares a folder's path
parameters, providers and per-request values once, and every <Endpoint>endpoint</Endpoint> under
it receives them in its handler, typed. A child router inherits its parent's:

```ts
// src/endpoints/projects/$projectId/router.ts
import projects from '../router.js';

export default projects.child({
  context: { params: z.object({ projectId: z.uuid() }) },
});
```

See [Router context](./router-context.md).

## Each schema parses only its own value

In NestJS, every pipe bound to a route, its controller or the app is handed every argument of the
handler, your parameter decorators' values included, and has to pick which to validate. A Zod pipe
bound with `@UsePipes()`, as the NestJS docs build one, parses them all with its one schema.

An <Endpoint>endpoint</Endpoint> calls each schema on its own value: `input` on the body, `query`
and `params` on the parameters, `output` on the return value. With no pipe and no interceptor, it
is also faster: about 25% more requests per second where both are validated. See
[Performance](./performance.md).

## Responses the compiler checks

NestJS validates a response when the request runs. An <Endpoint>endpoint</Endpoint>'s return value
is also checked against `output` by the compiler, so a handler that returns the wrong shape doesn't
build. See [Type safety](./type-safety.md#the-return-value).
