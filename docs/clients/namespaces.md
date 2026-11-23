---
description: Router namespaces nest operations in the generated clients, and a client's namespaces option limits it to part of the API.
---

# Namespaces

A namespace decides where an operation sits **in the generated client**. A router that declares
one puts its endpoints in a nested object named after it, so the client's shape follows your
routers:

```ts
// src/endpoints/shop/router.ts
export default EndpointRouter.create({ namespace: true });

// src/endpoints/shop/recipes/router.ts
export default EndpointRouter.create({ namespace: true });
```

```ts
// the request function and its hook, side by side
await client.shop.recipes.create({ body: { name: 'Pizza' } });
const create = client.shop.recipes.useCreate();
```

Namespaces have no effect on URLs. Without any, every operation sits at the client's root under
its full name: `client.shopRecipesCreate()`.

## The `namespace` option

| Value | Meaning |
| --- | --- |
| Left out, or `false` | The router adds nothing. Its endpoints sit in its parent's namespace. |
| `true` | The router's `basePath` if it sets one, otherwise its folder's name, in a `router.ts`. A router with neither stops the app from starting: one created elsewhere, such as in `app.module.ts`, or in a folder that names a path parameter, such as `$projectId`. Give it a string. |
| A string | That exact name. |

A namespace is a name: letters, digits, `-` and `_`, starting with a letter. A base path of
several segments, such as `api/shop`, is not one, so a router with it takes a string.

A folder with no `router.ts` is part of the URL but not of the namespace. Under a `shop`
router with a namespace, `shop/catering/book.endpoint.ts` serves `/shop/catering/book` and is
called as `client.shop.cateringBook()`.

The `description` of a router that sets `namespace` becomes a comment on its object in the
client, which your editor shows on hover.

## How names are derived

1. An operation's id is its URL in PascalCase, without the `:param` segments:
   `/shop/recipes/edit/:recipeId` is `ShopRecipesEdit`.
2. The request function is that id with a lowercase first letter, and the hook is `use` and the
   id: `shopRecipesEdit`, `useShopRecipesEdit`.
3. Inside a namespace, the namespace's own prefix is dropped: in `shop.recipes`, they are `edit`
   and `useEdit`.

| File, under namespaced `shop` and `recipes` routers | Client |
| --- | --- |
| `shop/homepage.endpoint.ts` | `client.shop.homepage()` |
| `shop/recipes/create.endpoint.ts` | `client.shop.recipes.create()` |
| `shop/recipes/edit/$recipeId.endpoint.ts` | `client.shop.recipes.edit({ path: { recipeId } })` |
| `shop/catering/book.endpoint.ts` | `client.shop.cateringBook()` |

Two things follow from these rules:

- **Give an endpoint file a name of its own in a namespaced folder.** A bare `endpoint.ts` in
  `shop/recipes/` has the id `ShopRecipes`, which is the whole namespace, so it keeps its full
  name: `client.shop.recipes.shopRecipes()`.
- **Names must be unique.** Two operations that land on the same name stop codegen with a
  message saying which. Rename the endpoint file or the namespace.

## A client per front end

One server can generate several clients, each limited to the top-level namespaces it needs:

```ts
await setupCodegen(app, {
  clients: [
    // The whole API, for other back-end services.
    { type: 'axios', outputFile: process.cwd() + '/generated/backend.ts' },

    // One client per front end.
    {
      type: 'react-query',
      outputFile: process.cwd() + '/generated/admin-client.tsx',
      namespaces: ['auth', 'admin'],
    },
    {
      type: 'react-query',
      outputFile: process.cwd() + '/generated/shop-client.tsx',
      namespaces: ['auth', 'shop'],
    },
  ],
});
```

A filtered client has only the operations in those namespaces, and only the types they use.
Operations outside any namespace are left out of it.
