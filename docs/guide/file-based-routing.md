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
        ├── router.ts
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

A parameter that a whole folder shares, such as the `$recipeId` of everything under
`recipes/$recipeId/`, can be declared once, on a router. See
[Router context](./router-context.md#path-parameters).

### A name beside a parameter

A file or folder with a name, beside a `$param` one, has every URL under that name. With
`recipes/featured.endpoint.ts` beside `recipes/$recipeId/view.endpoint.ts`, `/recipes/featured`
is the featured endpoint's, and `/recipes/featured/view` is a 404, as a URL no route answers:
a path parameter doesn't take a name beside it as its value. The paths of the app's own
controllers count as names too.

On Express, which answers a URL with the first route registered that matches it, create the
app with `routeResolutionStrategy: 'specificity'`, so that NestJS registers names before
parameters. The app warns as it starts where it needs this. Fastify and the Node adapter always
match a name first.

```ts
const app = await NestFactory.create(AppModule, { routeResolutionStrategy: 'specificity' });
```

## Changing a route without moving the file

- Set `basePath` on the [router](./routers.md#base-path) to change the prefix of everything it
  owns.
- Set [`path`](./explicit-paths.md) on an endpoint to give it a URL that has nothing to do with
  its location.

## Builds

A URL comes from its file's location, so a build must write one output file per source file, as
`tsc`, SWC and `nest build` do. Bundling into one file (Webpack, `nest build --webpack`) is not
supported.

Build into a clean folder (`deleteOutDir` in `nest-cli.json`, on in a new Nest project): a built
app serves every compiled endpoint file it finds, one left from a deleted endpoint included.
`nest start` skips a compiled endpoint whose source is gone, when `sourceMap` is on.
