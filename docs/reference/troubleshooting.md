---
description: Symptoms and causes — routes that 404, validation errors, setup, codegen and import cycles.
---

# Troubleshooting

## Routes

| Symptom | Cause |
| --- | --- |
| A route answers `404` | The file isn't named `<name>.endpoint.ts` or `endpoint.ts`; or it doesn't `export default` its endpoint; or it sits in a folder owned by a nested `router.module.ts` you didn't expect. |
| A new endpoint answers `404` | An endpoint file is served after a restart. `nest start --watch` restarts by itself; with `node --watch`, set `watch: true` in [`NestjsEndpoints.forRoot`](./router.md#nestjsendpoints-forroot). See [Development](../guide/development.md). A built app serves the endpoint files that are in its build: build again. |
| A route is mounted at `/dist/…` or `/src/…` | An endpoint registered by hand has no `path`. See [Explicit paths](../guide/explicit-paths.md). |
| Routes disappear in production | The build bundles the app into one file. File-based routing needs each file on disk. |
| `middleware options object must be the last entry` | The `{ exclude }` object isn't the last entry of a router's `middleware`. |

## Requests and responses

| Symptom | Cause |
| --- | --- |
| `400` "Validation failed" on search or path parameters | `query` and `params` values arrive as strings. Use `z.coerce.number()`, `z.stringbool()` or `z.coerce.date()`. |
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
| `this app has N routers and no root` when the app starts | The app imports several routers and none is the root. Add [`NestjsEndpoints.forRoot`](./router.md#nestjsendpoints-forroot) to the app module; the other routers stay as `EndpointRouterModule.create()`. |
| `NestjsEndpoints.forRoot() is called more than once` | An app calls `forRoot` once, in its root module. Make every other router with `EndpointRouterModule.create()`. |
| `Vitest must process this package to load endpoint files. Add it to "server.deps.inline" in your Vitest config`, in a test run | The Vitest config the run uses doesn't inline the package. Add [the setting](../guide/testing.md#vitest) to each of your Vitest configs. |

## Routers and injections

| Symptom | Cause |
| --- | --- |
| `Cannot access 'router' before initialization` when the app loads. Under Vitest, `Cannot read properties of undefined (reading 'endpoint')`, or `'query'` or `'mutation'` | An import cycle: the router module statically imports a file that imports its `endpoint`, directly or through a provider, a guard or a listed endpoint. Move what the router module needs out of that file, or list the endpoint with an [`endpoints` callback](../guide/explicit-paths.md#on-a-router). |
| `` `endpoints` lists a module that exports no endpoint `` | An `import()` in a router's `endpoints` callback points at a module with no endpoint export. Point it at the endpoint's file. |
| `<endpoint file> is built with the endpoint of <router A> but is owned by <router B>` | The endpoint is built with another router's `endpoint`. Build it with the `endpoint` of the router that owns it. |
| `` `x` is already injected by its router `` | The endpoint declares a key its router's `endpointConfig` already provides. Remove it from the endpoint. |
| `` `x` is in both inject and injectOnRequest `` | A router's `endpointConfig` declares the key in both maps. Keep it in one. |

## Generated clients

| Symptom | Cause |
| --- | --- |
| Nothing is regenerated after an endpoint changes | Codegen isn't running; or the route isn't in that client, because it is a plain controller's, or in a namespace the client's `namespaces` leaves out. `forceGenerate: true` regenerates every client. |
| `Two operations resolve to the same wrapper property` | Two operations have the same name in the same namespace. Rename an endpoint file, or a namespace. See [How names are derived](../clients/namespaces.md#how-names-are-derived). |
| An operation keeps its full name inside its namespace, such as `client.shop.recipes.shopRecipes` | A bare `endpoint.ts` whose URL is the namespace itself. Give the file a name of its own. |
| `useApiClient must be used within an <ApiClientProvider>` | No `<ApiClientProvider>` above the component. |
| Type errors about `XMLHttpRequest` or `BodyInit` in a generated client | The project compiles without the `dom` lib. Add it: `"lib": ["esnext", "dom"]`. |
