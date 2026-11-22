---
description: How an endpoint file's location becomes its URL — path segments, $param path parameters, _folders and endpoint.ts files.
---

# File-based routing

With file-based routing, an endpoint's URL is where its file sits. You create a file and
`export default` an endpoint from it. A [router](./routers.md) finds it and registers it.

```
src/
├── app.module.ts
└── endpoints/
    ├── health.endpoint.ts               GET  /health
    └── orders/
        ├── router.module.ts
        ├── orders.service.ts
        ├── create.endpoint.ts           POST /orders/create
        ├── list.endpoint.ts             POST /orders/list
        ├── $orderId.view.endpoint.ts    POST /orders/:orderId/view
        └── $orderId.cancel.endpoint.ts  POST /orders/:orderId/cancel
```

A router scans its folder when the app starts, where the app runs: `src/` under a TypeScript
loader or Vitest, `dist/` when compiled. It does so the same way in every environment. An
endpoint file you add is served after a restart: see [Development](./development.md).

## Endpoint files

A file is an endpoint file when its name ends in `.endpoint.ts`, or is exactly `endpoint.ts`.
The `.js`, `.mjs` and `.mts` extensions work too.

Every other file is ignored. Services, schemas, guards and tests can sit right beside the
endpoints they belong to.

## How a path is built

A URL is the router's `basePath`, then the folders between the router's `rootDirectory` and the
file, then the file's own name:

| Rule | Example | URL |
| --- | --- | --- |
| A folder is a segment | `user/create.endpoint.ts` | `/user/create` |
| A file named `endpoint.ts` adds no segment | `shop/recipes/endpoint.ts` | `/shop/recipes` |
| A folder starting with `_` is left out | `user/_mutations/create/endpoint.ts` | `/user/create` |
| A segment starting with `$` is a path parameter | `recipes/edit/$recipeId.endpoint.ts` | `/recipes/edit/:recipeId` |
| A `.` in a name splits it into segments | `recipes/$recipeId.view/endpoint.ts` | `/recipes/:recipeId/view` |

The rules combine, in folder names and file names alike:

| File | URL |
| --- | --- |
| `greet.endpoint.ts` | `/greet` |
| `recipes/$recipeId.delete.endpoint.ts` | `/recipes/:recipeId/delete` |
| `recipes/$recipeId/check-ingredients.endpoint.ts` | `/recipes/:recipeId/check-ingredients` |
| `restaurant/$restaurantId/recipes/$recipeId.view/endpoint.ts` | `/restaurant/:restaurantId/recipes/:recipeId/view` |

Use `_` folders to group files without changing their routes: `_queries/`, `_mutations/`,
`_internal/`.

## Path parameters

Each `$name` segment becomes a `:name` in the URL, and must be declared in the endpoint's
`params` schema. Path parameters arrive as strings, so coerce the ones that aren't:

```ts twoslash
// @filename: src/endpoints/recipes/edit/$recipeId.sample.ts
import { endpoint, z } from 'nestjs-endpoints';
declare class RecipesRepository {
  rename(id: number, name: string): Promise<{ id: number; name: string }>;
}
// ---cut---
// src/endpoints/recipes/edit/$recipeId.endpoint.ts  →  POST /recipes/edit/:recipeId
export default endpoint.mutation({
  params: z.object({ recipeId: z.coerce.number() }),
  input: z.object({ name: z.string() }),
  output: z.object({ id: z.number(), name: z.string() }),
  inject: { recipes: RecipesRepository },
  handler: ({ params, input, recipes }) =>
    recipes.rename(params.recipeId, input.name),
});
```

Every `:param` in the URL must be a key of `params`, and every key of `params` must be a
`:param` in the URL.

## Changing a route without moving the file

- Set `basePath` on the [router](./routers.md#base-path) to change the prefix of everything it
  owns.
- Set [`path`](./explicit-paths.md) on an endpoint to give it a URL that has nothing to do with
  its location.

## Builds

Each URL is derived from its file's own location, so the compiled layout has to match the source
layout: one output file per source file, as `tsc`, SWC and `nest build` produce. A build that
bundles the app into a single file (Webpack, `nest build --webpack`) is not supported.

Build into a clean output folder, as `nest build` does in a new Nest project (`deleteOutDir` in
`nest-cli.json`): a built app serves the compiled endpoint files it finds, and a file left over
from an endpoint you deleted would be one of them. Under `nest start`, a compiled endpoint whose
source file is gone is not served; that needs `sourceMap` on, as it is in a new Nest project.
