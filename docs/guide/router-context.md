---
description: Router context — path parameters and injections a router declares once, for every endpoint under it and for its child routers.
---

# Router context

A router's context is what it gives the handler of every endpoint under it: path parameters,
providers and per-request values. You declare each once, on the router, with the options an
endpoint has for them: `params`, `inject` and `injectOnRequest`.

```
src/endpoints/projects/
├── router.ts                      inject, injectOnRequest
├── projects.service.ts
├── list.endpoint.ts                      POST /projects/list
└── $projectId/
    ├── router.ts                  params: projectId
    ├── view.endpoint.ts                  POST /projects/:projectId/view
    └── tasks.$taskId.complete.endpoint.ts  POST /projects/:projectId/tasks/:taskId/complete
```

No endpoint in that tree declares `projectId`, the service or the current user. Each handler
receives all three, typed.

## On a router

```ts twoslash
// @filename: src/endpoints/projects/router.sample.ts
import { decorated, EndpointRouter } from 'nestjs-endpoints';
import { CurrentUser, type User } from '../../auth/current-user.decorator.js';
import { ProjectsService } from './projects.service.js';
// ---cut---
// src/endpoints/projects/router.ts
export default EndpointRouter.create({
  providers: [ProjectsService],
  inject: { projects: ProjectsService },
  injectOnRequest: { user: decorated<User>(CurrentUser()) },
});
```

`create()` returns the router with an `endpoint` builder of its own, as
`NestjsEndpoints.forRoot()` does for the root router. An endpoint built with it receives the
router's context along with what it declares itself:

```ts twoslash
// @filename: src/endpoints/projects/list.sample.ts
import { z } from 'nestjs-endpoints';
// ---cut---
// src/endpoints/projects/list.endpoint.ts
import router from './router.js';

export default router.endpoint.query({
  output: z.array(z.object({ id: z.string(), name: z.string() })),
  handler: ({ projects, user }) => projects.listFor(user.id),
});
```

The context reaches the endpoints built with the router's `endpoint`. An endpoint built with the
package's own `endpoint` gets none of it.

A router file can also re-export the builder, with `export const { endpoint } = router;`, so
its endpoints import `endpoint` from `./router.js`.

## Path parameters

A router's `params` are the path parameters of a folder: a plain `z.object()` whose keys are
`:param`s in the URL of each of its endpoints. With
[file-based routing](./file-based-routing.md#path-parameters), put the router in the folder that
names the parameter:

```ts twoslash
// @filename: src/endpoints/projects/$projectId/router.sample.ts
import { z } from 'nestjs-endpoints';
// ---cut---
// src/endpoints/projects/$projectId/router.ts
import projects from '../router.js';

export default projects.child({
  params: z.object({ projectId: z.uuid() }),
});
```

```ts twoslash
// @filename: src/endpoints/projects/$projectId/view.sample.ts
import { z } from 'nestjs-endpoints';
// ---cut---
// src/endpoints/projects/$projectId/view.endpoint.ts
import router from './router.js';

export default router.endpoint.query({
  output: z.object({ id: z.string(), name: z.string() }),
  handler: ({ params, projects, user }) => {
    //        ^?
    return projects.find(params.projectId, user.id);
  },
});
```

An endpoint declares only the parameters of its own, and the handler receives both:

```ts twoslash
// @filename: src/endpoints/projects/$projectId/tasks.$taskId.complete.sample.ts
import { z } from 'nestjs-endpoints';
// ---cut---
// src/endpoints/projects/$projectId/tasks.$taskId.complete.endpoint.ts
import router from './router.js';

export default router.endpoint.mutation({
  params: z.object({ taskId: z.coerce.number() }),
  output: z.object({ done: z.boolean() }),
  handler: ({ params, projects, user }) => {
    //        ^?
    return projects.completeTask(params.projectId, params.taskId, user.id);
  },
});
```

The router's parameters are validated with the endpoint's own, as one schema. They are in the
endpoint's [`invoke()`](../reference/endpoint.md#invoke), in its
[OpenAPI](../clients/openapi.md) operation and in the generated clients' `path` group, like the
parameters an endpoint declares.

- **Every endpoint built with the router's `endpoint` has the parameter in its URL.** One that
  doesn't stops the app from starting. Endpoints outside the `$param` folder belong to a router
  that doesn't declare it.
- **A router's `params` is a plain `z.object()`**: not one behind a transform or a preprocess
  step. An endpoint that adds parameters of its own declares a plain object too.
- **A rule on the whole object stays with the schema that states it.** A router's
  `z.strictObject()` or `.refine()` applies to the endpoints that add no parameters. An endpoint
  that adds its own is validated by its own object's rules, with each of the router's keys still
  checked by its schema. Put a rule on a key's schema to keep it everywhere.

## Child routers

`router.child()` creates a router nested under another, as the `$projectId` router above is under
the `projects` one. It takes the options `create()` takes, and the child's endpoints receive the
parent's context and the child's own. Context accrues through every level: the endpoints of a
child's child have the context of both routers above them.

A child's `router.ts` sits in a folder under its parent's, where the parent
[finds it](./routers.md#nested-routers). A nested router made with
`EndpointRouter.create()` has no parent's context: it starts its own.

### Providers

A child router has its parent's `providers` and `imports`, as the same instances, so it lists
only what is its own. The `$projectId` router above lists none: `ProjectsService` is the
`projects` router's. A child's endpoints, guards, interceptors and middleware can depend on what
its parents provide, and so can its own providers.

A provider the child lists again in its own `providers` is a second instance, which the child and
the routers under it use.

A router with child routers keeps its `providers` in a NestJS module of their own, which its
children import. So does a router that declares lifecycle hooks, `properties` or `methods`. In
its endpoints, guards, interceptors and middleware, `ModuleRef.get()` and `resolve()` find them
with `{ strict: false }`, which looks in the whole app.

## When two levels declare the same key

The most specific declaration wins: an endpoint's over its router's, and a child router's over
its parent's.

```ts
// The router's `user` is the full record; this endpoint only needs the id.
export default router.endpoint.query({
  injectOnRequest: { user: decorated<number>(CurrentUserId()) },
  handler: ({ user }) => {
    // user: number
  },
});
```

`inject` and `injectOnRequest` name the handler's parameters together, so a key declared in
either one replaces the outer level's key of that name, whichever of the two it was in. A path
parameter an endpoint declares again is read with the endpoint's schema.

## Import cycles

An endpoint file imports its router file to get `endpoint`, and a child router imports its
parent to call `child()`. So a router file must not import those files back: not directly, and
not through a provider or a guard. That cycle fails when the app loads, with
`Cannot access 'router' before initialization`.

A router that lists such endpoints by hand lists them with a
[callback of `import()`s](./explicit-paths.md#on-a-router).

See the [router options reference](../reference/router.md) for every option.
