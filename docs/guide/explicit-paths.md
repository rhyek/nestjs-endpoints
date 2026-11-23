---
description: Register endpoints by hand with an explicit path, as controllers or on a router, and mix them with file-based routing.
---

# Explicit paths

File-based routing is the idiomatic way to lay out endpoints, but it is optional. An endpoint
can name its own `path`, and be registered like any NestJS controller, with no router.

## As a controller

Give the endpoint a `path`, export it by name, and list it in a module's `controllers`:

```ts
// src/health-check.ts
import { endpoint, z } from 'nestjs-endpoints';

export const healthCheck = endpoint.query({
  path: '/status/health',
  method: 'get', // a probe calls it with a GET
  output: z.object({ ok: z.boolean() }),
  handler: () => ({ ok: true }),
});
```

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { healthCheck } from './health-check.js';

@Module({
  controllers: [healthCheck],
})
export class AppModule {}
```

::: warning Always set `path` on an endpoint you register by hand
Without `path`, an endpoint outside a router derives its URL from its file's location relative
to the working directory. In a compiled app that includes the output folder, which gives routes
such as `/dist/health-check`.
:::

## On a router

A router's `endpoints` takes endpoints created elsewhere. They get the router's `basePath`,
providers, guards, interceptors and namespace:

```ts
// src/recipes/create-recipe.ts  →  POST /recipes/create
export const createRecipe = endpoint.mutation({
  path: 'create',
  // …
});
```

```ts
// src/recipes/router.ts
import { EndpointRouter } from 'nestjs-endpoints';
import { createRecipe } from './create-recipe.js';
import { listRecipes } from './list-recipes.js';

export default EndpointRouter.create({
  basePath: 'recipes',
  providers: [RecipesRepository],
  endpoints: [createRecipe, listRecipes],
});
```

Endpoints built with the router's own `endpoint` builder, to receive its
[context](./router-context.md), are listed with a callback of
`import()`s. A static import of them from the router file would be an import cycle.

```ts
export default EndpointRouter.create({
  basePath: 'recipes',
  providers: [RecipesRepository],
  inject: { recipes: RecipesRepository },
  endpoints: () => [import('./create-recipe.js'), import('./list-recipes.js')],
});
```

The router calls the callback when it runs. Each `import()` lists every endpoint the module
exports, default or named.

## Mixing the two styles

Both styles work in one app, and on one router: a router registers the endpoint files it finds
and everything in its `endpoints`.
