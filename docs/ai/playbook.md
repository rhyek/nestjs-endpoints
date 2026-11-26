---
description: Recipes for a coding agent - tell whether a repo uses nestjs-endpoints, add or change an endpoint, route it, give it providers, regenerate and call the client, test it, and find the cause of an error.
---

# Agent playbook

Recipes for a coding agent working on an HTTP API built with nestjs-endpoints. Each one links to
the page with the details. The pages sit beside this one, as Markdown.

## Is this repo using it?

Check, in order:

1. `nestjs-endpoints` in the `dependencies` of a `package.json`.
2. Files named `*.endpoint.ts` or `endpoint.ts`, or `router.ts`.
3. A call to `setupCodegen(` in a `main.ts` or another bootstrap file.

If none of those appear, the library is not in play, and these pages don't apply.

## How to write endpoints here

Write every endpoint you add this way. See
[Recommended architecture](../guide/architecture.md) for the reasons and examples.

1. **The id of what an endpoint acts on is in its path:** a `$param` segment and `params`, never
   a field of `input`. Several actions on one resource follow it after a `.`: `$orderId.cancel`.
2. **What three or more endpoints in a folder share goes on a `router.ts` there, once:** their
   path parameters (`context.params`), the providers and per-request values they inject
   (`context.inject`, `context.injectOnRequest`), their guards, middleware and interceptors,
   and their `namespace`. A nested folder's router is its parent's `child()`: it inherits the
   context, providers and imports above it, and declares only what it adds. A router's guards,
   middleware and interceptors act on every endpoint under it, at any depth. One or two
   endpoints declare what they share themselves.
3. **An endpoint holds its own logic.** Its handler does the work with what it injects directly
   (the database, a queue, a mail client), with `properties`, `methods` and `lifecycle` for its
   own state ([State and lifecycle](../guide/state-and-lifecycle.md)). Write a service only for
   domain knowledge several endpoints need.
4. **`POST` is the default.** Set `method: 'get'` for a health check, a URL a browser or another
   system calls directly, or a response HTTP caches should hold. A read is `endpoint.query()`
   whatever its method.
5. **Each status an endpoint answers with is in its `output`,** described with
   `.meta({ description })`.
6. **Follow these even where the endpoints around yours don't.** Leave those as they are unless
   you were asked to change them.

## Rules

- **One file, one endpoint.** An endpoint file default-exports one `endpoint.query({...})` (a
  read) or `endpoint.mutation({...})` (a write). Its URL comes from where the file sits, under
  the folder of the nearest `router.ts`. See [File-based routing](../guide/file-based-routing.md).
- **Nothing registers an endpoint file by hand.** A router serves every endpoint file in its
  folder. Don't add one to a module's `controllers` or a router's `endpoints`, unless it is
  [registered by hand on purpose](../guide/explicit-paths.md), with a `path`.
- **The app's root module calls `NestjsEndpoints.forRoot({ router })`, once.** Every other
  router is `EndpointRouter.create()`. See [Routers](../guide/routers.md#the-root-router).
- **ESM only.** The project has `"type": "module"`, and its relative imports end in `.js`.
- **No bundling.** File-based routing reads each endpoint file on disk, so the app is built
  with `tsc` or `nest build`, never Webpack or a bundler.
- **`params` and `query` values arrive as strings.** Read them with `z.coerce.number()`,
  `z.coerce.date()` or `z.stringbool()`.
- **A new endpoint file is served after the app restarts.** `nest start --watch` restarts by
  itself; with `node --watch`, `NestjsEndpoints.forRoot` needs `watch: true`. See
  [Development](../guide/development.md).
- **Every Vitest config inlines the package:** `server.deps.inline: ['nestjs-endpoints']`. See
  [Testing](../guide/testing.md#vitest).
- **Don't edit a generated client.** It is rewritten from the endpoints. Change the endpoint,
  and regenerate.
- **Use `injectOnRequest`.** `injectMethod` and `injectAtRequest` are deprecated names for it.

## Add an endpoint

1. Create `<router folder>/<segments>/<name>.endpoint.ts`. The path from the router's folder is
   the URL: `orders/$orderId.cancel.endpoint.ts` is `POST /orders/:orderId/cancel`, and
   `orders/create.endpoint.ts` is `POST /orders/create`.
2. `export default endpoint.query({...})` for a read, `endpoint.mutation({...})` for a write,
   with its `params`, `query`, `input` and `output` schemas and its `handler`. The `$orderId`
   is declared in `params` (`z.object({ orderId: z.coerce.number() })`), unless a router above
   declares it. See [Writing an endpoint](../guide/endpoints.md) and
   [Endpoint options](../reference/endpoint.md).
3. Give it what it needs with `inject`, and list each provider in the `providers` of the router
   that owns the folder. See [Dependency injection](../guide/dependency-injection.md).
4. Restart the app if it doesn't restart by itself, and regenerate the client if the app has one.

## Serve a `GET`

An endpoint is a `POST` unless it sets `method`. Set `method: 'get'` for a health check, a URL a
browser or another system calls directly, or a response HTTP caches should hold. A `GET` takes no
`input`: its request is `query`. See [HTTP method](../guide/endpoints.md#http-method).

## Change an endpoint's URL

- **A path parameter:** name the file or folder `$name` (`orders/$orderId.endpoint.ts`), and
  add `params: z.object({ orderId: z.coerce.number() })`. A parameter doesn't take the name
  of a route beside it as a value; on Express, create the app with
  `routeResolutionStrategy: 'specificity'`. See
  [Path parameters](../guide/file-based-routing.md#path-parameters).
- **A folder that groups files without adding to the URL:** start its name with `_`.
- **A different URL, without moving the file:** set `path` on the endpoint, or `basePath` on
  its router. See [Changing a route](../guide/file-based-routing.md#changing-a-route-without-moving-the-file).

## Give a folder its own providers or guards

Put a `router.ts` in the folder, with
`export default EndpointRouter.create({ providers, guards })`. The parent router imports
it by itself, and its base path is the folder's name. Its `middleware`, `interceptors` and
`guards` apply to every endpoint under it. See [Nested routers](../guide/routers.md#nested-routers)
and [Middleware, interceptors and guards](../guide/routers.md#middleware-interceptors-and-guards).

Add one once three endpoints in a folder share a path parameter, an injection, a guard, middleware or an interceptor.

A value every endpoint of a router needs goes in the router's `context`: a provider in `inject`,
the current user in `injectOnRequest`, and the path parameter of a `$param` folder in `params`.
A provider the router's [own lifecycle hooks or methods](../guide/routers.md#own) use goes in its
top-level `inject`. A nested
router made with the parent's `child()` inherits them, with the parent's `providers` and
`imports`: it lists only its own. A router's guards and interceptors are one instance for every
endpoint under it, made with that router's providers. A router that lists one of its parent's
guards, interceptors or providers again gets an instance of its own, and so does an endpoint
that lists one of its routers' guards or interceptors; such a guard runs twice, the parent's
first. See [What flows down](../guide/what-flows-down.md) and
[Router context](../guide/router-context.md).

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
  supertest. See [Over HTTP](../guide/testing.md#over-http). Replace a router's or an
  endpoint's guard or interceptor with `.overrideGuard()` or `.overrideInterceptor()`, as in
  plain NestJS.
- **Through the client:** point a generated client at the test app. See
  [Through the generated client](../guide/testing.md#through-the-generated-client).
- **The handler, under its routers:** import the router of its folder alone, which brings
  what the routers above it give, and call `invoke()`. No middleware, guards or interceptors
  run. See [Invoking an endpoint directly](../guide/testing.md#invoke).
- **The handler in isolation:** load the endpoint as a controller, provide everything it and
  its routers inject, and call `invoke()`. See
  [Testing an endpoint in isolation](../guide/testing.md#isolation).

## An error or a 404

[Troubleshooting](../reference/troubleshooting.md) has each error message the library throws or
answers with, and its cause.
