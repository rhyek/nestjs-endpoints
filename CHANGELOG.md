# Changelog

## 3.1.1

### Fixes

- **A test can replace a router's guards and interceptors with NestJS's `overrideGuard()` and `overrideInterceptor()`.** See [Testing](docs/guide/testing.md#over-http).

## 3.1.0

### Features

- **A router declares the path parameters of its folder in `context.params`**, and every endpoint built with its `endpoint` receives them, validated and typed. See [Router context](docs/guide/router-context.md#path-parameters).
- **`router.child()` creates a nested router that inherits its parent's `context`, `providers` and `imports`**, through every level. See [What flows down](docs/guide/what-flows-down.md).
- **An endpoint may declare a key its router injects, and its own wins.**
- **A router file can be named `router.ts`**, and `router.module.ts` keeps working. See [Routers](docs/guide/routers.md#nested-routers).
- **Endpoints and routers take NestJS's lifecycle hooks in `lifecycle`**, such as `lifecycle: { onModuleInit() {} }`, and a router starts after the routers above it. See [Endpoint options](docs/reference/endpoint.md#options).
- **A child router loads by itself in a test with everything the routers above it give**, and none of their endpoints. See [Testing](docs/guide/testing.md).
- **A router's guards and interceptors are one instance for every endpoint under it**, made with what that router provides, and a router that lists one again has its own. See [What flows down](docs/guide/what-flows-down.md).
- **Endpoints take `guards` and `interceptors`**, which run after those of their routers. See [Endpoint options](docs/reference/endpoint.md#options).
- **Endpoints and routers declare `properties` and `methods`, and a handler, method or hook written as a method reads them, and what is injected, from `this`.** See [`this`](docs/reference/endpoint.md#this).
- **A router's `inject` is for its own lifecycle hooks and methods**, and its endpoints get what its `context` gives. See [Router options](docs/reference/router.md#options).
- **The docs recommend an architecture, and a `/nestjs-endpoints-refactor` skill reworks an API to it.** See [Recommended architecture](docs/guide/architecture.md).

### Fixes

- **A router's guard or interceptor that depends on a request-scoped provider no longer makes the endpoints under it for each request**, so their lifecycle hooks run.
- **A router file in a `$param` folder gets the path parameter in its base path**, as in `/clinics/:clinicId`.
- **`invoke()` can leave out `params` that have no required key**, as it can `query`.
- **A router's middleware runs for an endpoint at the router's own base path**, as an `endpoint.ts` in its folder.
- **An endpoint whose `path` has a wildcard, or text beside a parameter as in `files/:name.json`, gets the right OpenAPI path, operation name and path parameters.**
- **A router's middleware runs for its endpoints that have a version of their own**, and its `exclude` works, in an app with versions in its URLs.

### Breaking changes

- **A router's guards and interceptors are made with that router's providers and imports**, not those of the routers under it. One that injects what only a router under it provides fails at startup: provide it on the router that lists the guard.
- **`invoke()` takes one object, `{ params, query, input }`, each key optional.** Move the input under `input`: `invoke(body, { params })` becomes `invoke({ params, input: body })`. See [`invoke()`](docs/reference/endpoint.md#invoke).
- **A router's `endpointConfig` is renamed `context`**, which takes `params` too. Rename the key. See [Router context](docs/guide/router-context.md).
- **`EndpointRouterModule` is renamed `EndpointRouter`**, and the deprecated `EndpointsRouterModule` and `register()` are removed. Rename the import, and call `create()`.
- **`getHttpPathPascalName`, `getEndpointHttpPath`, `getCallsiteFile` and `moduleAls` are not exported**: they were the library's internals.
- **`schema()` is removed: a schema's `.meta({ description })` describes its response in the OpenAPI document**, as in `201: created.meta({ description: 'Created' })`, and an `input`'s describes the request body. See [Responses](docs/guide/responses.md#several-statuses).
- **Routers have no `exports`.** Provide what another module needs in a module, and import it in both.
- **A router file is one that exports a router.** Import a module that a `router.module.ts` default-exports where the app needs it.
- **A router's `endpoints` refuses an entry that is not an endpoint.** Remove it, or list a controller in a module's `controllers`.
- **A namespace is a name: letters, digits, `-` and `_`, starting with a letter.** A router whose `namespace: true` finds none, or one that isn't a name, stops the app from starting: give `namespace` a string.
- **A router's `description` needs `namespace` on the same router.** Add `namespace`, or remove the description.
- **An `inject` key cannot be named `handler`, `invoke`, `configure` or as a lifecycle hook.** Rename the key.
- **An endpoint cannot declare one key in both `inject` and `injectOnRequest`**, as a router cannot. Remove it from one of them.
- **An endpoint whose `params` declare a key its URL lacks stops the app from starting.** Remove the key, or add it to the URL.
- **A nested router's guards and interceptors run after those of the routers above it.**
- **Two router files in one folder that both export a router stop the app from starting**, as `a.router.module.ts` beside `b.router.module.ts`. Keep one of them.
- **A path parameter doesn't take the name of a route beside it as its value**: `/recipes/featured/view` is a 404 beside `recipes/featured`. On Express, create the app with `routeResolutionStrategy: 'specificity'`. See [Path parameters](docs/guide/file-based-routing.md#a-name-beside-a-parameter).
- **A router created in a file named `router.ts` takes its folder's name as base path, and is found by the router of a folder above it**, as one in a `router.module.ts` is. Set `basePath`, or rename the file, to keep its routes where they were.

## 3.0.0

### Features

- **Endpoints take path parameters: declare them with `params`, and in file-based routing prefix a file or folder segment with `$`**, as in `recipes/edit/$recipeId.endpoint.ts` for `/recipes/edit/:recipeId`. See [File-based routing](docs/guide/file-based-routing.md#path-parameters).
- **Endpoints declare search parameters with `query`, on any method**, and react-query operations carry them as `schemas.query`. See [Queries and mutations](docs/guide/endpoints.md).
- **A router's `namespace` nests its endpoints in the generated clients**, as `client.shop.recipes.create(...)` next to `client.shop.recipes.useCreate()`. See [Namespaces](docs/clients/namespaces.md).
- **A client's `namespaces` limits it to those top-level namespaces**, so one app can generate a narrower client for each front end. See [Per-client namespace filter](docs/clients/namespaces.md#a-client-per-front-end).
- **A router module declares `inject` and `injectOnRequest` once for its endpoints**, in `endpointConfig`. See [Router context](docs/guide/router-context.md).
- **Each react-query client operation carries its `queryOptions` / `queryKey` or `mutationOptions` / `mutationKey`, bound to the client instance**, so route loaders can use `queryClient.ensureQueryData(...)` outside React. See [react-query](docs/clients/react-query.md).
- **Generated clients make their requests with Kubb's own axios client**: each exports `ResponseError` and `isResponseError`, and a call's `.unwrap()` resolves to the body alone. See [Codegen](docs/clients/codegen.md).
- **Endpoints handle up to 10% more requests per second.**
- **Works with NestJS's Node adapter (`@nestjs/platform-node`)**, alongside Express and Fastify.
- **Works with TypeScript 7.**
- **`@nestjs/swagger` is an optional peer dependency**: install it only to build an OpenAPI document. See [OpenAPI](docs/clients/openapi.md).
- **Installing the package gives coding agents a rules file and a skill that point them at its docs**, which ship inside the package with an `llms.txt` index. See [Built for agents](docs/ai/overview.md).

### Fixes

- **A router's guard or interceptor that depends on a request-scoped provider no longer makes the endpoints under it for each request**, so their lifecycle hooks run.
- **File-based routing now works when the project path contains a space**, and on Windows.

### Breaking changes

- **`endpoint()` is replaced by `endpoint.query()` and `endpoint.mutation()`, which decide whether the react-query client gives an operation query or mutation hooks.** Rename each `endpoint(` to the builder for its kind. See [Queries and mutations](docs/guide/endpoints.md).
- **Endpoints are POSTs by default, and `input` is always the JSON body.** Send a read's input as the body, or add `method: 'get'` to an endpoint that must stay a GET and declare its input as `query`.
- **This package is now ESM-only.** Set `"type": "module"` in your project; CommonJS is no longer supported.
- **`setupOpenAPI` and `setupCodegen`'s `openapi` option are removed.** Build the document with `@nestjs/swagger`'s `SwaggerModule.createDocument()`, which finds everything it needs on the endpoints. See [OpenAPI](docs/clients/openapi.md).
- **NestJS >= 12 is required, and `@nestjs/swagger` >= 12 where it is installed.** Run `nest upgrade` to migrate.
- **Node.js >= 24.22 is required.**
- **TypeScript >= 6 is required.**
- **The library is set up with `NestjsEndpoints.forRoot` in the app's root module, and an app that imports several routers does not start without it.** Replace the app module's `EndpointRouterModule.create({ … })` with `NestjsEndpoints.forRoot({ router: { … } })`. See [Setup](docs/guide/getting-started.md#set-up-the-app-module).
- **Under Vitest, file-based routing needs `nestjs-endpoints` in `server.deps.inline`.** Add it to each of your Vitest configs. See [Vitest](docs/guide/testing.md#vitest).
- **A `.` in an endpoint file or folder name splits the URL into segments, and a leading `$` makes a path parameter.** Set `path` on an endpoint whose URL must keep the dot or the `$`.
- **Generated client methods and hooks take one object that groups the request into `path`, `query` and `body`.** Change `client.userCreate({ name })` to `client.userCreate({ body: { name } })`, and `mutateAsync({ data })` to `mutateAsync({ body })`. See [Codegen](docs/clients/codegen.md).
- **The react-query client's hooks are on the client object, not top-level exports.** Replace `useUserCreate()` with `useApiClient().useUserCreate()`. See [react-query](docs/clients/react-query.md).
- **Generated clients cover endpoints only.** Call the routes of plain Nest controllers through `client.axios`, or generate a client for them from the OpenAPI document. See [OpenAPI](docs/clients/openapi.md).
- **`orval` is no longer installed with the package.** Add it to your own dependencies if you run it against the OpenAPI document.
- **Each client is written as its `outputFile` plus a folder of the same name beside it.** Commit or ignore the folder with the file, and import only from the file.
- **Generated client calls take no per-call `headers`.** Set request headers on the client's axios instance, `client.axios`.
- **Generated client calls resolve to `{ status, data, error, headers, … }` and throw a `ResponseError`, not an `AxiosResponse` and an `AxiosError`; so do react-query hooks' errors.** Read `error.status` and `error.data` instead of `error.response.status` and `error.response.data`. See [Codegen](docs/clients/codegen.md).
- **A call's axios config goes in its object, under `options`, not in a second argument.** Change `client.userFind({ id }, { timeout: 5000 })` to `client.userFind({ body: { id }, options: { timeout: 5000 } })`.
- **Response interceptors on `client.axios` see every status as a success, with the body not yet decoded.** Handle a failed call where it throws its `ResponseError`.
- **The generated clients type-check with the `dom` lib.** Add `"dom"` to `lib` in a Node-only project's tsconfig.
- **A react-query client's `options` are [`@kubb/plugin-react-query` 5's](https://kubb.dev/extensions/kubb-labs/plugin-react-query/options), not orval's.** Rewrite the ones you pass.
- **The react-query client requires `@tanstack/react-query` >= 5.82, and every client `axios` >= 1.20.**
- **Query keys are `[{ url, params? }, query?, body?]`.** Build a key you wrote by hand with the operation's `queryKey(...)`. See [react-query](docs/clients/react-query.md).
- **Generated per-operation type names changed; `<Operation>Input` and `<Operation>Output` keep theirs.** Replace `<Operation>Params` with `<Operation>Input` or `<Operation>Query`, and `<Operation>QueryResult` and `<Operation>MutationResult` with `<Operation>Output`.
- **A `z.bigint()` in an endpoint schema needs `.meta({ type })`, or startup throws.** Add it to the `z.bigint()` itself, as in `z.coerce.bigint().meta({ type: 'string' })`.
- **A `.meta({ id })` that names two different schemas in requests, or two in responses, is an error: `setupCodegen` throws, and so does building the OpenAPI document.** Give one of them a different id.
- **Each OpenAPI operation has one automatic tag, its namespace or its URL's folders, instead of one per path prefix.** Add any other tag an endpoint must keep to its `tags`.
- **`shouldJson` is no longer exported.** Replace it with `typeof value !== 'string'`.

## 2.3.0 (2026-04-18)

### Features

- **Renamed to `EndpointRouterModule` / `create()`**: The module is now `EndpointRouterModule` and its static method is `create()`. The old `EndpointsRouterModule` + `register()` names remain as deprecated aliases — existing code keeps working unchanged.
- **`guards` on `EndpointRouterModule.create()`**: New `guards` option, mirroring `interceptors`. Applied controller-scoped to every endpoint owned by the router (including nested subtrees) via `@UseGuards(...)`.

## 2.2.0 (2026-04-18)

### Features

- **`rootDirectory` accepts `string | string[]`**: An `EndpointsRouterModule` can now scan multiple folders. Each entry is scanned the same way as a single root: any directory encountered that contains a `router.module.*` is auto-discovered as a nested router (at any depth, including the entry itself).
- **Folder-inferred `basePath` for `router.module.ts` files**: When the callsite is a `router.module.ts` and `basePath` is omitted, the `basePath` is inferred from the folder containing the router module — at the top level from `path.basename(definedAtDir)`, and for nested routers from the parent's `basePath` joined with the child's folder relative to the parent's folder. Pass `basePath: ''` to opt out.

## 2.1.0 (2026-04-18)

### Features

- **Nested router modules**: A subdirectory under a parent `EndpointsRouterModule`'s `rootDirectory` can now own its endpoints and providers by default-exporting an `EndpointsRouterModule` from a `router.module.ts` file. The parent auto-discovers it, imports it, and derives the child's `basePath` from its folder name.
- **Middleware and interceptors on `EndpointsRouterModule`**: `register()` now accepts `middleware` (class-based or functional, with an optional trailing `{ exclude: string[] }` options entry whose paths are resolved against the router's `basePath`) and `interceptors` (controller-scoped). Both apply to every endpoint in the router's subtree, including nested router modules.
- Now handles digit path segments (e.g. `recipes-v2/list` → `RecipesV2List`).

## 2.0.4 (2026-01-18)

### Bug fixes

- Allow `z.preprocess()` on input schemas for GET endpoints

### Testing

- Added unit tests for `ApiQueries` helper function

## 2.0.3 (2025-11-16)

## Bug fixes

- Disallow both ZodNull and ZodNullable types for output

## 2.0.2 (2025-11-16)

### Bug fixes

- Middleware that added response headers after controller execution were failing with `Cannot set headers after they are sent to the client`.

  This was fixed, however nestjs-endpoints can no longer support endpoint output schemas that are nullable. NestJS does not send `null` when using Express.js. [More info](https://github.com/nestjs/nest/issues/10415).

  So instead of:

  ```ts
  endpoint({
    output: personSchema.nullable(),
    ...
  });
  ```

  now do:

  ```ts
  endpoint({
    output: z.object({
      person: personSchema.nullable()
    }),
    ...
  })
  ```

## 2.0.1 (2025-10-19)

### Minor changes

- Deprecated `injectAtRequest` in favor of `injectOnRequest`

## 2.0.0 (2025-09-15)

### Breaking Changes

- **Upgraded to Zod v4**: Zod v3 schemas will have to be upgraded to v4.
- **Upgraded to zod-openapi v5**: See the [v5 migration guide](https://github.com/samchungy/zod-openapi/blob/HEAD/docs/v5.md) if you used `.openapi()` extensions.
- **OpenAPI version upgrade**: Now generates OpenAPI 3.1.1 schemas (previously 3.0.0).

### Minor changes

- Deprecated `injectMethod` parameter in favor of `injectAtRequest` for clarity.

## 1.5.1 (2025-06-28)

### Testing

- Added more tests

## 1.5.0 (2025-06-22)

### Features

- Replaced `nestjs-zod` with [zod-openapi](https://github.com/samchungy/zod-openapi). The main benefit is output schemas will now emit OpenApi schemas and consequently TypeScript definitions for endpoint payloads that consider zod transforms.

Example:

```typescript
const schema = z.object({
  age: z.number().default(30),
});
```

The above schema when used in `input` will still mark `age` as optional, but when used in `output` it will not.

```typescript
type ExampleInput = {
  age?: number;
};

type ExampleOutput = {
  age: number;
};
```

## 1.4.0 (2025-06-13)

### Features

- Provide `rawInput` to handlers with input schemas. This is the request body parsed by NestJS, but before zod.

## 1.3.1 (2025-05-26)

### Bugfixes

- Support OPTIONS HTTP method
- Use my fork of @nestjs/zod until this is merged: https://github.com/BenLorantfy/nestjs-zod/pull/151

## 1.3.0 (2025-04-12)

### Features

- Added support for traditional controller imports + explicit HTTP paths
- Can now call `invoke()` on endpoint instances. Useful for integration testing. [Example](https://github.com/rhyek/nestjs-endpoints/blob/1b1242348ebc77abad5ad0c67ab372690102d736/packages/test/test-app-express-cjs/test/app.e2e-spec.ts#L467).

## 1.2.0 (2025-04-05)

### Features

- Integrated orval setup for axios and react-query clients using `setupCodegen`. No longer necessary for users to set this up themselves.

## 1.1.0 (2025-03-29)

### Breaking Changes

- Replaced `EndpointsRouterModule.forRoot()` with `EndpointsRouterModule.register()`
- Removed `EndpointsModule` decorator

### Features

- Added support for multiple router registrations in different modules
- Each registration will have its own `rootDirectory` and `baseBath`
