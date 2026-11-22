---
description: Routers — NestJS modules that find a folder's endpoints and give them a URL prefix, providers, middleware, interceptors and guards.
---

# Routers

A router is a NestJS module that owns a folder of endpoints. It finds the endpoint files under
its folder, registers them, and gives each one its URL.

A router also carries what its endpoints share: a URL prefix, providers, middleware,
interceptors, guards, and a [namespace](../clients/namespaces.md) in the generated client.

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
`EndpointRouterModule.create()`, which takes the same [options](../reference/router.md#options):
a [nested router](#nested-routers), or one created
[inside a regular module](#inside-a-regular-module).

## Nested routers

A folder becomes a router of its own when it has a `router.module.ts` that default-exports one.
The parent router finds it and imports it. Nothing is registered by hand.

```
src/
├── app.module.ts
└── endpoints/
    └── shop/
        ├── homepage.endpoint.ts          → /shop/homepage
        └── recipes/
            ├── router.module.ts          ← owns this folder
            ├── recipes.repository.ts
            ├── list.endpoint.ts          → /shop/recipes/list
            └── create.endpoint.ts        → /shop/recipes/create
```

```ts
// src/endpoints/shop/recipes/router.module.ts
import { EndpointRouterModule } from 'nestjs-endpoints';
import { RecipesRepository } from './recipes.repository.js';

export default EndpointRouterModule.create({
  providers: [RecipesRepository],
  description: 'Recipe catalog and authoring.',
});
```

A nested router owns its folder: the parent doesn't look inside it. Its endpoints resolve their
providers in the nested router's module, so a feature's services stay with the feature.

`description` documents the group: it becomes a comment on the router's
[namespace](../clients/namespaces.md) in the generated client.

## Base path

A router's `basePath` is the URL prefix of everything it owns. It is inferred from where the
router is created:

| Where the router is created | Inferred `basePath` |
| --- | --- |
| A `router.module.ts`, at the top level | `/` and the file's folder name |
| A `router.module.ts`, under a parent router | The parent's `basePath`, then the folder's path under the parent |
| Anywhere else (`app.module.ts`, a feature module) | `/` |

Pass `basePath` to set it yourself, or `''` to mount the router at the root:

```ts
// src/blog/router.module.ts: the folder is `blog`, the routes are under /articles
export default EndpointRouterModule.create({
  rootDirectory: 'endpoints',
  basePath: 'articles',
});
```

## Middleware, interceptors and guards

A router's `middleware`, `interceptors` and `guards` apply to every endpoint in its folder,
nested routers included.

Plain NestJS has no such scope: a guard or an interceptor is either global (`APP_GUARD`,
`APP_INTERCEPTOR`) or repeated on each controller. On a router you declare it once, for the
whole folder.

```ts
// src/endpoints/admin/router.module.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { EndpointRouterModule } from 'nestjs-endpoints';

export default EndpointRouterModule.create({
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

## Shared injections

What every endpoint of a router needs, `inject` and `injectOnRequest` alike, can be declared once,
on the router, in `endpointConfig`. `create()` returns the router with an `endpoint` builder of
its own, as `NestjsEndpoints.forRoot()` does for the root router, and each endpoint built with it
receives the router's injections along with its own:

```ts
// src/workspace/router.module.ts
import { decorated, EndpointRouterModule } from 'nestjs-endpoints';

export default EndpointRouterModule.create({
  providers: [WorkspaceService, AuditService],
  endpointConfig: {
    inject: { workspace: WorkspaceService },
    injectOnRequest: { user: decorated<User>(CurrentUser()) },
  },
});
```

```ts
// src/workspace/rename.endpoint.ts
import { z } from 'nestjs-endpoints';
import router from './router.module.js';

export default router.endpoint.mutation({
  input: z.object({ name: z.string() }),
  inject: { audit: AuditService },
  handler: ({ input, workspace, user, audit }) => {
    // …
  },
});
```

A router module can also re-export the builder, with `export const { endpoint } = router;`, so
its endpoints import `endpoint` from `./router.module.js`.

- **The injections reach the endpoints built with the router's `endpoint`.** A
  [nested router](#nested-routers) declares its own.
- **A key is declared once.** An endpoint that declares a key its router already injects is a
  type error.

### Import cycles

An endpoint file imports its router module to get `endpoint`, so the router module must not
import the endpoint file back: not directly, and not through a provider or a guard. That cycle
fails when the app loads, with `Cannot access 'router' before initialization`.

A router that lists such endpoints by hand lists them with a
[callback of `import()`s](./explicit-paths.md#on-a-router).

## Inside a regular module

A router can be created in the `imports` of any `@Module()`, beside the app's root router, when
you want ordinary NestJS wiring around it:

```ts
@Module({
  providers: [AuthService],
  exports: [AuthService],
  imports: [
    EndpointRouterModule.create({ basePath: 'auth', providers: [AuthService] }),
  ],
})
export class AuthModule {}
```

See the [router options reference](../reference/router.md) for every option.
