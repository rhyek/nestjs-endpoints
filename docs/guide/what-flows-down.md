---
description: What flows down — what a router gives the routers and endpoints under it, on one example — context and providers, lifecycle hooks, guards, interceptors and middleware, and the order each runs in.
---

# What flows down

A router gives what it has to everything under it: the routers made with its `child()`, and
their endpoints. This page follows one folder, with a router, a child router and one endpoint:

```
src/endpoints/teams/
├── router.ts               teams
└── $teamId/
    ├── router.ts           $teamId, made with teams' child()
    └── invite.endpoint.ts  invite
```

::: code-group

```ts [teams/router.ts]
export default EndpointRouter.create({
  imports: [DbModule],
  context: { inject: { db: DbService } },
  middleware: [RequestIdMiddleware],
  guards: [SignedInGuard],
  interceptors: [TimingInterceptor],
});
```

```ts [teams/$teamId/router.ts]
import teamsRouter from '../router.js';

export default teamsRouter.child({
  context: { params: z.object({ teamId: z.uuid() }) },
  middleware: [LoadTeamMiddleware],
  guards: [TeamMemberGuard],
  interceptors: [AuditInterceptor],
});
```

:::

```ts
// src/endpoints/teams/$teamId/invite.endpoint.ts
import teamRouter from './router.js';

export default teamRouter.endpoint.mutation({
  input: z.object({ email: z.email() }),
  guards: [TeamAdminGuard],
  handler: ({ params, input, db }) =>
    db
      .insert(invites)
      .values({ teamId: params.teamId, email: input.email }),
});
```

In the diagrams below: <Owner parent>teams</Owner> is the router,
<Owner child>$teamId</Owner> its child, and <Owner endpoint>invite</Owner> the endpoint.

## Context and providers {#context}

The handler receives what every router above it declares in [`context`](./router-context.md):

| In the handler | Declared by |
| --- | --- |
| `db` | <Owner parent>teams</Owner> `context.inject` |
| `params.teamId` | <Owner child>$teamId</Owner> `context.params` |
| `input` | <Owner endpoint>invite</Owner> `input` |

<Owner child>$teamId</Owner> also has the `imports` and `providers` of
<Owner parent>teams</Owner>, so it lists only its own.

## Lifecycle hooks {#lifecycle}

Each of the three can declare NestJS's lifecycle hooks in `lifecycle`. At each lifecycle event,
NestJS calls that hook on all three, in this order:

<FlowPair>
<FlowLane>

**Startup**

- `onModuleInit()`
  1. <Owner parent>teams</Owner> router
  2. <Owner child>$teamId</Owner> router
  3. <Owner endpoint>invite</Owner> endpoint
- `onApplicationBootstrap()`
  1. <Owner parent>teams</Owner> router
  2. <Owner child>$teamId</Owner> router
  3. <Owner endpoint>invite</Owner> endpoint

</FlowLane>
<FlowLane>

**Shutdown**

- `onModuleDestroy()`
  1. <Owner endpoint>invite</Owner> endpoint
  2. <Owner child>$teamId</Owner> router
  3. <Owner parent>teams</Owner> router
- `beforeApplicationShutdown()`
  1. <Owner endpoint>invite</Owner> endpoint
  2. <Owner child>$teamId</Owner> router
  3. <Owner parent>teams</Owner> router
- `onApplicationShutdown()`
  1. <Owner endpoint>invite</Owner> endpoint
  2. <Owner child>$teamId</Owner> router
  3. <Owner parent>teams</Owner> router

</FlowLane>
</FlowPair>

Shutdown runs on `app.close()`, or on a signal once the app calls `enableShutdownHooks()`.

## Guards and interceptors {#guards}

A request for the endpoint passes each one once, from the outer router in:

<FlowPair>
<FlowLane>

**`POST /teams/42/invite`**

- Guards
  1. <Owner parent>teams</Owner> `SignedInGuard`
  2. <Owner child>$teamId</Owner> `TeamMemberGuard`
  3. <Owner endpoint>invite</Owner> `TeamAdminGuard`
- Interceptors, before the handler
  1. <Owner parent>teams</Owner> `TimingInterceptor`
  2. <Owner child>$teamId</Owner> `AuditInterceptor`
- Handler
  1. <Owner endpoint>invite</Owner> `handler()`

</FlowLane>
<FlowLane :start="7">

**The response**

- Interceptors, after the handler
  1. <Owner child>$teamId</Owner> `AuditInterceptor`
  2. <Owner parent>teams</Owner> `TimingInterceptor`

</FlowLane>
</FlowPair>

An endpoint's own [`interceptors`](../reference/endpoint.md#options) run after those of its
routers too.

## Middleware {#middleware}

Middleware runs first, before any guard, from the outer router in:

<FlowPair>
<FlowLane>

**`POST /teams/42/invite`**

- Middleware
  1. <Owner parent>teams</Owner> `RequestIdMiddleware`
  2. <Owner child>$teamId</Owner> `LoadTeamMiddleware`
- Then the guards, the interceptors and the handler

</FlowLane>
</FlowPair>

## One instance each {#instances}

Each provider, guard and interceptor of a router is one instance, for every endpoint and
router under it: `SignedInGuard` is made once, with what <Owner parent>teams</Owner> provides
and imports.

A child router that lists one again has an instance of its own. So does an endpoint, for a
guard or an interceptor. Both instances run, the parent's first:

```ts
// src/endpoints/teams/$teamId/router.ts
export default teamsRouter.child({
  // A second SignedInGuard, for this folder.
  guards: [SignedInGuard, TeamMemberGuard],
});
```

## A nested router made with `create()` {#create}

It starts a context and providers of its own. The middleware, guards and interceptors of the
routers above it still apply to its folder.

| | `child()` | `create()` |
| --- | --- | --- |
| `context` | ✓ | |
| `imports` and `providers` | ✓ | |
| `middleware`, `guards` and `interceptors` | ✓ | ✓ |
| Lifecycle order | ✓ | ✓ |
