---
description: How to lay out an API built with nestjs-endpoints - the resource in the path, a router for everything a folder shares, self-contained endpoints, and GET where it fits.
---

# Recommended architecture

nestjs-endpoints serves any layout you give it. The one below uses what the library is built
for: URLs that name what they act on, folders that declare what they share once, and endpoint
files that hold their own logic. Start new APIs this way, and write new endpoints this way in
an API that is laid out otherwise.

## The resource in the path {#path}

The id of the thing an endpoint acts on goes in its URL, as a [path parameter](./file-based-routing.md#path-parameters),
not in its body. The URL then says what the request is about to everything that sees it: logs,
guards and middleware, rate limits, caches, and the generated client, where the call reads
`client.orders.cancel({ path: { orderId } })`.

```ts
// src/endpoints/orders/cancel.endpoint.ts  →  POST /orders/cancel
export default endpoint.mutation({
  // The order acted on, hidden in the body.
  input: z.object({ orderId: z.number() }),
  // …
});
```

```ts twoslash
// @filename: src/endpoints/orders/$orderId.cancel.sample.ts
import { endpoint, z } from 'nestjs-endpoints';
import { orderSchema } from './order.schema.js';
import { OrdersService } from './orders.service.js';
// ---cut---
// src/endpoints/orders/$orderId.cancel.endpoint.ts
//   →  POST /orders/:orderId/cancel
export default endpoint.mutation({
  params: z.object({ orderId: z.coerce.number() }),
  output: orderSchema,
  inject: { orders: OrdersService },
  handler: ({ params, orders }) => orders.cancel(params.orderId),
});
```

- **Several actions on one resource follow its parameter in the file name:** `$orderId.view`,
  `$orderId.cancel`, `$orderId.refund`, since a `.` in a name splits it into segments. Each
  stays one file, and the folder needs no subfolder per action. See
  [How a path is built](./file-based-routing.md#how-a-path-is-built).
- **An id that is the request's data stays in the body,** such as the product an order is for.

## A router for what a folder shares {#router}

What several endpoints in a folder all need goes on a `router.ts` in that folder, once: their
path parameters, the providers and per-request values they inject, their guards, middleware and
interceptors, and their group in the generated client. One or two endpoints that share something
declare it themselves. From three, give their folder a router.

A router reaches down its whole folder, so each level of a tree declares only what it adds:

```
src/endpoints/projects/
├── router.ts               create(): guards, namespace, context
├── list.endpoint.ts
└── $projectId/
    ├── router.ts           child(): guards, context.params
    ├── view.endpoint.ts
    ├── rename.endpoint.ts
    └── tasks/$taskId/
        ├── router.ts       child(): context.params
        ├── rename.endpoint.ts
        ├── assign.endpoint.ts
        └── complete.endpoint.ts
```

The top router declares what every project endpoint shares:

```ts twoslash
// @filename: src/endpoints/projects/router.sample.ts
import type { CanActivate } from '@nestjs/common';
import { decorated, EndpointRouter } from 'nestjs-endpoints';
import { CurrentUser, type User } from '../../auth/current-user.decorator.js';
import { ProjectsService } from './projects.service.js';
declare class SignedInGuard implements CanActivate {
  canActivate(): boolean;
}
// ---cut---
// src/endpoints/projects/router.ts
export default EndpointRouter.create({
  namespace: true,
  providers: [ProjectsService],
  guards: [SignedInGuard],
  context: {
    inject: { projects: ProjectsService },
    injectOnRequest: { user: decorated<User>(CurrentUser()) },
  },
});
```

Each router below it is its parent's [`child()`](./what-flows-down.md), and adds
its parameter, and a guard where it needs one:

```ts twoslash
// @filename: src/endpoints/projects/$projectId/router.sample.ts
import type { CanActivate } from '@nestjs/common';
import { z } from 'nestjs-endpoints';
declare class ProjectMemberGuard implements CanActivate {
  canActivate(): boolean;
}
// ---cut---
// src/endpoints/projects/$projectId/router.ts
import projects from '../router.js';

export default projects.child({
  guards: [ProjectMemberGuard],
  context: {
    params: z.object({ projectId: z.uuid() }),
  },
});
```

```ts twoslash
// @filename: src/endpoints/projects/$projectId/tasks/$taskId/router.sample.ts
import { z } from 'nestjs-endpoints';
// ---cut---
// src/endpoints/projects/$projectId/tasks/$taskId/router.ts
import project from '../../router.js';

export default project.child({
  context: {
    params: z.object({ taskId: z.coerce.number() }),
  },
});
```

An endpoint three levels down declares none of it. Its handler receives both parameters, the
service and the current user, typed, and it runs behind both guards:

```ts twoslash
// @filename: src/endpoints/projects/$projectId/tasks/$taskId/router.ts
import { z } from 'nestjs-endpoints';
import project from '../../router.js';

export default project.child({
  context: { params: z.object({ taskId: z.coerce.number() }) },
});
// @filename: src/endpoints/projects/$projectId/tasks/$taskId/complete.sample.ts
import { z } from 'nestjs-endpoints';
// ---cut---
// src/endpoints/projects/$projectId/tasks/$taskId/complete.endpoint.ts
//   →  POST /projects/:projectId/tasks/:taskId/complete
import router from './router.js';

export default router.endpoint.mutation({
  output: z.object({ done: z.boolean() }),
  handler: ({ params, projects, user }) =>
    projects.completeTask(
      params.projectId,
      params.taskId,
      user.id,
    ),
});
```

Down the tree:

- **What a router has reaches everything under it**: its context, its providers and imports,
  and its guards, middleware and interceptors, which run from the outermost router in. A task
  endpoint runs `SignedInGuard`, then `ProjectMemberGuard`. See
  [What flows down](./what-flows-down.md).
- **[`namespace`](../clients/namespaces.md)** groups the endpoints under the router in the
  generated client: `client.projects.view(...)`.
- **A provider a router itself uses**, in its own lifecycle hooks or methods, goes in its
  top-level [`inject`](./routers.md#own), apart from `context`.

## Self-contained endpoints {#repr}

An endpoint file holds its request, its response, and the work between them: the
[REPR pattern](https://www.apitemplatepack.com/docs/introduction/repr-pattern/) (request,
endpoint, response). Reading one file tells you everything the endpoint does. The handler does
the work, with what it injects directly: the database, a queue, a mail client. Here `DbService`
is the app's Drizzle database, which a module provides under that class, as
`{ provide: DbService, useFactory: () => drizzle(process.env.DATABASE_URL!, { schema }) }`, so
endpoints inject it by its class.

```ts twoslash
// @filename: src/endpoints/orders/$orderId.cancel.sample.ts
import { eq } from 'drizzle-orm';
import { endpoint, z } from 'nestjs-endpoints';
import { DbService } from '../../db/db.service.js';
import { orders } from '../../db/schema.js';
// ---cut---
// src/endpoints/orders/$orderId.cancel.endpoint.ts
//   →  POST /orders/:orderId/cancel
export default endpoint.mutation({
  params: z.object({ orderId: z.coerce.number() }),
  output: {
    200: z
      .object({ id: z.number(), status: z.literal('cancelled') })
      .meta({ description: 'The order, cancelled' }),
    404: z
      .object({ message: z.string() })
      .meta({ description: 'No such order' }),
    409: z
      .object({ message: z.string() })
      .meta({ description: 'The order is paid' }),
  },
  inject: { db: DbService },
  handler: async ({ params, db, response }) => {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, params.orderId));
    if (!order) {
      return response(404, { message: 'Order not found' });
    }
    if (order.status === 'paid') {
      return response(409, {
        message: 'A paid order is refunded, not cancelled',
      });
    }
    await db
      .update(orders)
      .set({ status: 'cancelled' })
      .where(eq(orders.id, order.id));
    return response(200, { id: order.id, status: 'cancelled' });
  },
});
```

Each status the endpoint answers with is in its [`output`](./responses.md#several-statuses), and
each schema's `.meta({ description })` describes that response in the
[OpenAPI document](../clients/openapi.md).

An endpoint keeps its own helpers and state too, as a controller does. `properties` are its
fields, `methods` its methods, and `lifecycle` its setup and teardown:

```ts twoslash
// @filename: src/endpoints/products/$productId.price.sample.ts
import { endpoint, z } from 'nestjs-endpoints';
import { DbService } from '../../db/db.service.js';
import { products } from '../../db/schema.js';
// ---cut---
// src/endpoints/products/$productId.price.endpoint.ts
//   →  POST /products/:productId/price
export default endpoint.query({
  params: z.object({ productId: z.string() }),
  output: {
    200: z
      .object({ price: z.number() })
      .meta({ description: 'The price' }),
    404: z
      .object({ message: z.string() })
      .meta({ description: 'No such product' }),
  },
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
  handler({ params, response }) {
    const price = this.prices.get(params.productId);
    return price === undefined
      ? response(404, { message: 'No such product' })
      : response(200, { price });
  },
});
```

See [State and lifecycle](./state-and-lifecycle.md) for what each of them reaches.

### When to write a service {#services}

Write a service for domain knowledge that several endpoints need: the rules for pricing an
order, the steps of a sign-up that three endpoints start. Inject it where it is needed, and keep
the rest of each endpoint's work in the endpoint.

- **Infrastructure is injected directly.** A service that only forwards to the database adds a
  file to read and nothing to know.
- **One endpoint's logic stays in that endpoint,** however long it is. Its `methods` split it up.
- **Pure logic a folder's endpoints share** can be plain functions in a file beside them, with no
  provider at all.

## `GET` where the use case calls for it {#get}

An endpoint is a `POST` unless it sets `method`, and the generated client calls every method the
same way. Use `GET` where a caller other than the client needs it: a health check, a URL a
browser or another system requests directly, or a response that HTTP caches should hold.

```ts twoslash
// @filename: src/endpoints/health.sample.ts
import { endpoint, z } from 'nestjs-endpoints';
// ---cut---
// src/endpoints/health.endpoint.ts  →  GET /health
export default endpoint.query({
  method: 'get',
  output: z.object({ ok: z.boolean() }),
  handler: () => ({ ok: true }),
});
```

A `GET` takes [`query`](./endpoints.md#the-request), not `input`. A read is `endpoint.query()`
whatever its method.

## In an API laid out otherwise {#existing}

Write what you add this way, even where the endpoints around it are not. Leave the others as
they are until you set out to change them. To rework a whole API, coding agents have the
[`/nestjs-endpoints-refactor` skill](../ai/overview.md#the-agent-files).

## What to reach for {#features}

| You need | Use |
| --- | --- |
| The id of what an endpoint acts on | A `$param` file or folder, and [`params`](./file-based-routing.md#path-parameters) |
| Several actions on one resource | [A `.` after the parameter](./file-based-routing.md#how-a-path-is-built): `$orderId.cancel` |
| A parameter, an injection, a guard or middleware three endpoints share | A `router.ts`, with [`context`](./router-context.md) |
| A nested folder that shares its parent's context and providers | [`child()`](./what-flows-down.md) |
| The current user, or another per-request value | [`injectOnRequest`](./dependency-injection.md#injectonrequest-per-request-values) with `decorated()` |
| An endpoint's own helpers and state | [`methods` and `properties`](./state-and-lifecycle.md), on `this` |
| Setup or teardown | [`lifecycle`](./state-and-lifecycle.md#lifecycle-hooks), on an endpoint or [a router](./routers.md#own) |
| A provider the router itself uses | The router's own [`inject`](./routers.md#own) |
| A folder's guards, middleware or interceptors | [Its router](./routers.md#middleware-interceptors-and-guards) |
| Error responses | [`output` by status code](./responses.md#several-statuses) |
| A description in the OpenAPI document | [`.meta({ description })`](../clients/openapi.md) |
| A group in the generated client | [`namespace`](../clients/namespaces.md) |
| A URL a browser or another system calls | [`method: 'get'`](./endpoints.md#http-method), with `query` |
