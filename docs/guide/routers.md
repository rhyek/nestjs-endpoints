---
description: Routers — NestJS modules that find a folder's endpoints and give them a URL prefix, providers, middleware, interceptors and guards.
---

# Routers

A router is a NestJS module that owns a folder of endpoints. It finds the endpoint files under
its folder, registers them, and gives each one its URL.

A router also carries what its endpoints share: a URL prefix, providers, middleware,
interceptors, guards, a [context](./router-context.md) of path parameters and injections, and a
[namespace](../clients/namespaces.md) in the generated client.

## The root router

An app has one root router, which `NestjsEndpoints.forRoot` creates in the app module:

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { NestjsEndpoints } from 'nestjs-endpoints';

@Module({
  imports: [
    NestjsEndpoints.forRoot({
      router: { rootDirectory: './endpoints', providers: [OrdersService] },
    }),
  ],
})
export class AppModule {}
```

`rootDirectory` is the folder to look in, relative to the file that calls `forRoot()`. Without
it, the router looks in the calling file's own folder.

`forRoot` is called once per app. Every other router is made with
`EndpointRouter.create()`, which takes the same [options](../reference/router.md#options):
a [nested router](#nested-routers), or one created
[inside a regular module](#inside-a-regular-module). A nested router that inherits its parent's
[context](./router-context.md#child-routers) is made with the parent's `child()`.

## Nested routers

A folder becomes a router of its own when it has a `router.ts` that default-exports one.
The parent router finds it and imports it. Nothing is registered by hand.

A `router.ts` that exports no router is not a router file: the app loads it, and its folder
stays with the router above.

```
src/
├── app.module.ts
└── endpoints/
    └── shop/
        ├── homepage.endpoint.ts          → /shop/homepage
        └── recipes/
            ├── router.ts          ← owns this folder
            ├── recipes.repository.ts
            ├── list.endpoint.ts          → /shop/recipes/list
            └── create.endpoint.ts        → /shop/recipes/create
```

```ts
// src/endpoints/shop/recipes/router.ts
import { EndpointRouter } from 'nestjs-endpoints';
import { RecipesRepository } from './recipes.repository.js';

export default EndpointRouter.create({
  providers: [RecipesRepository],
  namespace: true,
  description: 'Recipe catalog and authoring.',
});
```

A nested router owns its folder: the parent doesn't look inside it. Its endpoints resolve their
providers in the nested router's module, so a feature's services stay with the feature. One made
with its parent's [`child()`](./router-context.md#providers) has the parent's providers too.

`namespace` groups the router's operations in the generated client, and `description` documents
that group: it becomes a comment on the router's [namespace](../clients/namespaces.md). A router
takes a `description` only beside `namespace`.

## Base path

A router's `basePath` is the URL prefix of everything it owns. It is inferred from where the
router is created:

| Where the router is created | Inferred `basePath` |
| --- | --- |
| A `router.ts`, at the top level | `/` and the file's folder name |
| A `router.ts`, under a parent router | The parent's `basePath`, then the folder's path under the parent. A `$param` folder is a [path parameter](./file-based-routing.md#path-parameters), as in an endpoint's path |
| Anywhere else (`app.module.ts`, a feature module) | `/` |

Pass `basePath` to set it yourself, or `''` to mount the router at the root:

```ts
// src/blog/router.ts: the folder is `blog`, the routes are under /articles
export default EndpointRouter.create({
  rootDirectory: 'endpoints',
  basePath: 'articles',
});
```

## Middleware, interceptors and guards

A router's `middleware`, `interceptors` and `guards` apply to every endpoint in its folder,
nested routers included. They run from the outermost router in: a router's before those of the
routers nested under it. The middleware of a router in a `$param` folder doesn't run for the URLs of
the [names beside that folder](./file-based-routing.md#a-name-beside-a-parameter).

Plain NestJS has no such scope: a guard or an interceptor is either global (`APP_GUARD`,
`APP_INTERCEPTOR`) or repeated on each controller. On a router you declare it once, for the
whole folder.

```ts
// src/endpoints/admin/router.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { EndpointRouter } from 'nestjs-endpoints';

export default EndpointRouter.create({
  providers: [AdminGuard],
  guards: [AdminGuard],
  interceptors: [AuditInterceptor],
  middleware: [
    RequestIdMiddleware, // a NestMiddleware class
    (_req: IncomingMessage, _res: ServerResponse, next: () => void) => {
      next();
    }, // or a function
    { exclude: ['login'] }, // options, as the last entry: skips /admin/login
  ],
});
```

A guard or interceptor passed as a class must be resolvable in the router's module: add it to
the router's `providers`, or export it from a module the router imports.

For a single endpoint, use its own [`decorators`](./dependency-injection.md#per-endpoint-decorators).

## Router context

A router can also declare, in its `context`, what every handler under it receives: path
parameters (`params`), providers (`inject`) and per-request values (`injectOnRequest`). A nested
router made with `router.child()` inherits them from its parent. See [Router context](./router-context.md).

## Inside a regular module

A router can be created in the `imports` of any `@Module()`, beside the app's root router, when
you want ordinary NestJS wiring around it:

```ts
@Module({
  providers: [AuthService],
  exports: [AuthService],
  imports: [
    EndpointRouter.create({ basePath: 'auth', providers: [AuthService] }),
  ],
})
export class AuthModule {}
```

See the [router options reference](../reference/router.md) for every option.
