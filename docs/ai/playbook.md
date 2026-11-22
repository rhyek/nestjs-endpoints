---
description: Recipes for a coding agent - tell whether a repo uses nestjs-endpoints, add or change an endpoint, route it, give it providers, regenerate and call the client, test it, and find the cause of an error.
---

# Agent playbook

Recipes for a coding agent working on an HTTP API built with nestjs-endpoints. Each one links to
the page with the details. The pages sit beside this one, as Markdown.

## Is this repo using it?

Check, in order:

1. `nestjs-endpoints` in the `dependencies` of a `package.json`.
2. Files named `*.endpoint.ts` or `endpoint.ts`, or `router.module.ts`.
3. A call to `setupCodegen(` in a `main.ts` or another bootstrap file.

If none of those appear, the library is not in play, and these pages don't apply.

## Rules

- **One file, one endpoint.** An endpoint file default-exports one `endpoint.query({...})` (a
  read) or `endpoint.mutation({...})` (a write). Its URL comes from where the file sits, under
  the folder of the nearest `router.module.ts`. See [File-based routing](../guide/file-based-routing.md).
- **Nothing registers an endpoint file by hand.** A router serves every endpoint file in its
  folder. Don't add one to a module's `controllers` or a router's `endpoints`, unless it is
  [registered by hand on purpose](../guide/explicit-paths.md), with a `path`.
- **The app's root module calls `NestjsEndpoints.forRoot({ router })`, once.** Every other
  router is `EndpointRouterModule.create()`. See [Routers](../guide/routers.md#the-root-router).
- **ESM only.** The project has `"type": "module"`, and its relative imports end in `.js`.
- **No bundling.** File-based routing reads each endpoint file on disk, so the app is built
  with `tsc` or `nest build`, never Webpack or a bundler.
- **`query` and `params` values arrive as strings.** Read them with `z.coerce.number()`,
  `z.coerce.date()` or `z.stringbool()`.
- **A new endpoint file is served after the app restarts.** `nest start --watch` restarts by
  itself; with `node --watch`, `NestjsEndpoints.forRoot` needs `watch: true`. See
  [Development](../guide/development.md).
- **Every Vitest config inlines the package:** `server.deps.inline: ['nestjs-endpoints']`. See
  [Testing](../guide/testing.md#vitest).
- **Don't edit a generated client.** It is rewritten from the endpoints. Change the endpoint,
  and regenerate.
- **Use the current names.** These still work, but new code uses the name beside them:

| Deprecated                         | Use                             |
| ---------------------------------- | ------------------------------- |
| `EndpointsRouterModule`            | `EndpointRouterModule`          |
| `EndpointsRouterModule.register()` | `EndpointRouterModule.create()` |
| `injectMethod`, `injectAtRequest`  | `injectOnRequest`               |

## Add an endpoint

1. Create `<router folder>/<segments>/<name>.endpoint.ts`. The path from the router's folder is
   the URL: `orders/create.endpoint.ts` is `POST /orders/create`.
2. `export default endpoint.query({...})` for a read, `endpoint.mutation({...})` for a write,
   with its `input`, `query`, `params` and `output` schemas and its `handler`. See
   [Writing an endpoint](../guide/endpoints.md) and [Endpoint options](../reference/endpoint.md).
3. Give it the providers it needs with `inject`, and list them in the `providers` of the router
   that owns the folder. See [Dependency injection](../guide/dependency-injection.md).
4. Restart the app if it doesn't restart by itself, and regenerate the client if the app has one.

An endpoint is a `POST` unless it sets `method`. A `GET` takes no `input`: its request is `query`.

## Change an endpoint's URL

- **A path parameter:** name the file or folder `$name` (`orders/$orderId.endpoint.ts`), and
  add `params: z.object({ orderId: z.coerce.number() })`. See
  [Path parameters](../guide/file-based-routing.md#path-parameters).
- **A folder that groups files without adding to the URL:** start its name with `_`.
- **A different URL, without moving the file:** set `path` on the endpoint, or `basePath` on
  its router. See [Changing a route](../guide/file-based-routing.md#changing-a-route-without-moving-the-file).

## Give a folder its own providers or guards

Put a `router.module.ts` in the folder, with
`export default EndpointRouterModule.create({ providers, guards })`. The parent router imports
it by itself, and its base path is the folder's name. Its `middleware`, `interceptors` and
`guards` apply to every endpoint under it. See [Nested routers](../guide/routers.md#nested-routers)
and [Middleware, interceptors and guards](../guide/routers.md#middleware-interceptors-and-guards).

A value every endpoint of a router needs, such as the current user, goes in the router's
`endpointConfig`. See [Shared injections](../guide/routers.md#shared-injections).

## Regenerate and call the client

- **Where it is generated:** find the `setupCodegen(` call, in `main.ts` or a script of its own.
  It writes the clients when the app starts, and rewrites one only when what it is generated
  from changed, such as an endpoint's schema. See [Generating clients](../clients/codegen.md).
- **Calling it:** a method takes one object, `{ path, query, body }`, with the parts the
  endpoint declares. See [axios](../clients/axios.md) and [React Query](../clients/react-query.md).
- **Its shape:** a router with `namespace` nests its operations (`client.shop.recipes.list`).
  A client's `namespaces` limits it to part of the API. See [Namespaces](../clients/namespaces.md).
- **A route missing from a client:** it is a plain controller, or in a namespace the client's
  `namespaces` leaves out.

## Test an endpoint

- **Over HTTP:** start the app with `Test.createTestingModule`, and send requests with
  supertest. See [Over HTTP](../guide/testing.md#over-http).
- **Through the client:** point a generated client at the test app. See
  [Through the generated client](../guide/testing.md#through-the-generated-client).
- **One router alone,** without the app module: see
  [Testing one router](../guide/testing.md#testing-one-router).
- **The handler alone:** call it with `invoke()`. See
  [Integration tests](../guide/testing.md#integration-tests).

## An error or a 404

[Troubleshooting](../reference/troubleshooting.md) has each error message the library throws or
answers with, and its cause.
