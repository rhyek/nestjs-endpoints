---
description: Router context — path parameters and injections a router declares once, for every endpoint under it and for its child routers.
---

# Router context

A router's context is what it gives the handler of every endpoint under it: path parameters,
providers and per-request values. You declare each once, in the router's `context`, with the
options an endpoint has for them: `params`, `inject` and `injectOnRequest`.

```
src/endpoints/projects/
├── router.ts             context: inject, injectOnRequest
├── projects.service.ts
├── list.endpoint.ts
└── $projectId/
    ├── router.ts         context: params (projectId)
    ├── view.endpoint.ts
    └── tasks.$taskId.complete.endpoint.ts
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
  context: {
    inject: { projects: ProjectsService },
    injectOnRequest: { user: decorated<User>(CurrentUser()) },
  },
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

Only endpoints built with the router's `endpoint` receive its context, not one built with the
package's own `endpoint`, and not the router itself, which has its own
[`inject`](./routers.md#own).

A router file can also re-export the builder, with `export const { endpoint } = router;`, so
its endpoints import `endpoint` from `./router.js`.

## Path parameters

A router's `context.params` are the path parameters of a folder: a plain `z.object()` whose keys are
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
  context: { params: z.object({ projectId: z.uuid() }) },
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

An endpoint declares only its own parameters, and the handler receives both:

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
    return projects.completeTask(
      params.projectId,
      params.taskId,
      user.id,
    );
  },
});
```

The router's parameters are validated with the endpoint's own, as one schema, and appear in the
endpoint's [`invoke()`](../reference/endpoint.md#invoke), its [OpenAPI](../clients/openapi.md)
operation and the generated clients' `path` group like its own.

A rule on the whole object, such as a router's `z.strictObject()` or `.refine()`, applies only
to the endpoints that add no parameters. One that adds its own is validated by its own object's
rules, with each of the router's keys still checked by its schema. Put a rule on a key's schema
to keep it everywhere.

## Child routers

`router.child()` creates a router nested under another, as the `$projectId` router above is under
the `projects` one. The child's endpoints receive the parent's context and the child's own, and
context accrues through every level: the endpoints of a child's child have the context of both
routers above them.

A child's `router.ts` sits in a folder under its parent's, where the parent
[finds it](./routers.md#nested-routers). A nested router made with `EndpointRouter.create()`
doesn't inherit its parent's context: it starts its own.

### Providers

A child router has its parent's `providers` and `imports`, as the same instances, so it lists
only its own: the `$projectId` router above lists none. Its endpoints, guards, interceptors,
middleware and providers can depend on what its parents provide.

A provider the child lists again in its own `providers` is a second instance, which the child and
the routers under it use.

## When two levels declare the same key

The most specific declaration wins: an endpoint's over its router's, and a child router's over
its parent's.

```ts
// The router's `user` is the full record;
// this endpoint only needs the id.
export default router.endpoint.query({
  injectOnRequest: { user: decorated<number>(CurrentUserId()) },
  handler: ({ user }) => {
    // user: number
  },
});
```

A key in `inject` or `injectOnRequest` replaces an outer level's key of that name, whichever of
the two it was in. A path parameter an endpoint declares again is read with the endpoint's schema.

See the [router options reference](../reference/router.md) for every option.
