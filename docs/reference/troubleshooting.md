---
description: Symptoms and causes — routes that 404, validation errors, setup, codegen and import cycles.
---

# Troubleshooting

## Routes

| Symptom | Cause |
| --- | --- |
| A route answers `404` | The file isn't named `<name>.endpoint.ts` or `endpoint.ts`; or it doesn't `export default` its endpoint; or it sits in a folder owned by a nested `router.ts` you didn't expect. |
| A new endpoint answers `404` | A new endpoint file is served after a restart, or in a built app, after a build. With `node --watch`, set `watch: true` in [`NestjsEndpoints.forRoot`](./router.md#nestjsendpoints-forroot). See [Development](../guide/development.md). |
| A route is mounted at `/dist/…` or `/src/…` | An endpoint registered by hand has no `path`. See [Explicit paths](../guide/explicit-paths.md). |
| Routes disappear in production | The build bundles the app into one file. File-based routing needs each file on disk. |

## Requests and responses

| Symptom | Cause |
| --- | --- |
| `400` "Validation failed" on path or search parameters | `params` and `query` values arrive as strings. Use `z.coerce.number()`, `z.stringbool()` or `z.coerce.date()`. |
| `400` `Body cannot be empty when content-type is set to 'application/json'`, on Fastify | A request with `Content-Type: application/json` and no body. Send `{}`, or leave the header off. |
| `` a GET endpoint cannot declare `input` `` at startup | An endpoint with `method: 'get'` declares `input`. A `GET` has no body: use `query`, or drop `method`. |
| A long type error on `handler`: `Type '(…) => …' is not assignable to type 'HandlerMethod<…>'` | The handler's return value doesn't match `output`. The last line of the message names the field. See [In a block body](../guide/type-safety.md#in-a-block-body). |
| `500` on a response that looks right | The return value doesn't match `output` (`ZodSerializationException`). |
| `Did not find schema for status code N` | `response(N, …)` with a status that `output` doesn't declare. |
| A handler returns a value, and nothing validates it | `output` has a schema per status, which requires `response(status, body)`. |
| A response's schema is `{}` or wrong, in the generated client or an OpenAPI document | A `.transform()` in the output schema. Use `.overwrite()`, or `.meta({ type })`. See [Transforms in output schemas](../guide/responses.md#transforms-in-output-schemas). |

## Setup

| Symptom | Cause |
| --- | --- |
| `this app has N routers and no root` when the app starts | The app imports several routers and none is the root. Add [`NestjsEndpoints.forRoot`](./router.md#nestjsendpoints-forroot) to the app module; the other routers stay as `EndpointRouter.create()`. |
| `NestjsEndpoints.forRoot() is called more than once` | An app calls `forRoot` once, in its root module. Make every other router with `EndpointRouter.create()`. |
| `Vitest must process this package to load endpoint files. Add it to "server.deps.inline" in your Vitest config`, in a test run | The Vitest config the run uses doesn't inline the package. Add [the setting](../guide/testing.md#vitest) to each of your Vitest configs. |

## Routers and injections

| Symptom | Cause |
| --- | --- |
| `Cannot access 'router' before initialization` when the app loads. Under Vitest, `Cannot read properties of undefined (reading 'endpoint')`, or `'query'`, `'mutation'` or `'child'` | An import cycle: the router file statically imports a file that imports its `endpoint` or calls its `child()`, directly or through a provider, a guard or a listed endpoint. Move what the router file needs out of that file, or list the endpoint with an [`endpoints` callback](../guide/explicit-paths.md#on-a-router). |
| `<endpoint file> is built with the endpoint of <router A> but is owned by <router B>` | The endpoint is built with another router's `endpoint`. Build it with the `endpoint` of the router that owns it. |
| `` `params` must be a plain z.object() `` | A router's `context.params`, or the `params` of an endpoint whose router declares some, is behind a transform or a preprocess step. Declare a plain object, and transform each value with its own schema. |
| ``the `params` of its router include the path parameter `x`, but its URL, …, has no `:x` `` | The endpoint is built with the `endpoint` of a router that declares `x`, and sits outside the `$x` folder. Move it under that folder, or declare `x` on a [router in the folder](../guide/router-context.md#path-parameters). |
| ``its `params` include `x`, but its URL, …, has no `:x` `` | The endpoint declares `x` in its own `params`, and nothing in its URL names it. Remove `x`, or add it to the URL: a `$x` folder or file name, or `:x` in `path`. |
| `<router file> is made with the child() of <router A> but is nested under <router B>` | A [child router](../guide/router-context.md#child-routers) sits in the folder of a router other than its parent. Make it with the `child()` of the router it is nested under. |
| `Nest can't resolve dependencies` of a provider, `in the RouterProvidersModule module` | A router with [child routers](../guide/router-context.md#providers) keeps its `providers` in that module. One of them injects something the router neither provides nor imports. |
| `Nest could not find X element` from `ModuleRef.get()` or `resolve()`, in a router with child routers, or with lifecycle hooks, `properties` or `methods` | The router's providers are in a module of their own. Pass `{ strict: false }`, which looks in the whole app. |
| `` `inject`, `context.inject`, `properties` or `methods` declares `x` … `this` has one member of each name `` | The name is already taken on [`this`](./endpoint.md#this), by another declaration, by `handler`, `invoke` or `configure`, or by a lifecycle hook. Rename it. |
| `declares onModuleInit, but NestJS makes it for each request` | An endpoint or a router with a lifecycle hook depends on a request-scoped provider, itself or through a guard, interceptor, pipe or filter. Do what the hook does in a provider that is not request-scoped. |
| `Nest can't resolve dependencies` of an endpoint, a guard or a middleware under a nested router | The nested router is made with `EndpointRouter.create()`, and has only its own `providers` and `imports`. Make it with its parent's [`child()`](../guide/router-context.md#providers), or list the provider on it. |
| A `404` for a URL whose value of a path parameter is the name of a route beside it, as `/recipes/featured/view` beside `recipes/featured` | A path parameter doesn't take a [name beside it](../guide/file-based-routing.md#a-name-beside-a-parameter) as a value. Rename the route, or the value. |
| `` has a path parameter beside routes with a name there `` warning as the app starts, and a `404` for a URL of a name | On Express, the route with the parameter was registered first, and answers the name's URLs. Create the app with `routeResolutionStrategy: 'specificity'`. |

## Generated clients

| Symptom | Cause |
| --- | --- |
| Nothing is regenerated after an endpoint changes | Codegen isn't running; or the route isn't in that client, because it is a plain controller's, or in a namespace the client's `namespaces` leaves out. `forceGenerate: true` regenerates every client. |
| `Two operations resolve to the same wrapper property` | Two operations have the same name in the same namespace. Rename an endpoint file, or a namespace. See [How names are derived](../clients/namespaces.md#how-names-are-derived). |
| An operation keeps its full name inside its namespace, such as `client.shop.recipes.shopRecipes` | A bare `endpoint.ts` whose URL is the namespace itself. Give the file a name of its own. |
| `useApiClient must be used within an <ApiClientProvider>` | No `<ApiClientProvider>` above the component. |
| Type errors about `XMLHttpRequest` or `BodyInit` in a generated client | The project compiles without the `dom` lib. Add it: `"lib": ["esnext", "dom"]`. |
