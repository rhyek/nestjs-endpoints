# Changelog

## 3.0.0 (unreleased)

### Features

- **Endpoints take path parameters: declare them with `params`, and in file-based routing prefix a file or folder segment with `$`**, as in `recipes/edit/$recipeId.endpoint.ts` for `/recipes/edit/:recipeId`. See [File-based routing](README.md#file-based-routing).
- **Endpoints declare search parameters with `query`, on any method**, and react-query operations carry them as `schemas.query`. See [Queries and mutations](README.md#queries-and-mutations).
- **A router's `namespace` nests its endpoints in the generated clients**, as `client.shop.recipes.create(...)` next to `client.shop.recipes.useCreate()`. See [Namespaces](README.md#namespaces).
- **A client's `namespaces` limits it to those top-level namespaces**, so one app can generate a narrower client for each front end. See [Per-client namespace filter](README.md#per-client-namespace-filter).
- **A router module declares `inject` and `injectOnRequest` once for its endpoints**, in `endpointConfig`. See [Router injections](README.md#router-injections).
- **A router's `endpoints` takes a callback of `import()`s**, so endpoints listed by hand can use the router's `endpoint`. See [Router injections](README.md#router-injections).
- **Each react-query client operation carries its `queryOptions` / `queryKey` or `mutationOptions` / `mutationKey`, bound to the client instance**, so route loaders can use `queryClient.ensureQueryData(...)` outside React. See [react-query](README.md#react-query).
- **Each react-query client operation that takes input carries `schemas.input`, its input as self-contained JSON Schema**, for forms to read. See [react-query](README.md#react-query).
- **Generated clients make their requests with Kubb's own axios client**: each exports `ResponseError` and `isResponseError`, and a call's `.unwrap()` resolves to the body alone. See [Codegen](README.md#codegen-optional).
- **An array search parameter reads a lone `?tags=a` as a one-item array.**
- **An endpoint can answer `null`: a nullable `output` is sent as the JSON `null` on every adapter**, which the generated clients read as `null`.
- **`NestjsEndpoints.forRoot({ router })` sets the library up in the app module**, with the app's root router. See [Setup](README.md#setup).
- **`npx nestjs-endpoints init` installs a coding-agent skill** pointing at the full library guide the package now ships at `docs/agents.md`. See [Coding agents](README.md#coding-agents).
- **A router's `description` documents its namespace in the generated clients**, as a comment editors show on hover.
- **Each OpenAPI operation carries `x-endpoint-kind` (`query` or `mutation`)**, for generators run against the document. See [OpenAPI](README.md#openapi).
- **Endpoints handle up to 10% more requests per second.**
- **Works with NestJS's Node adapter (`@nestjs/platform-node`)**, alongside Express and Fastify.
- **Works with TypeScript 7.**
- **`@nestjs/swagger` is an optional peer dependency**: install it only to build an OpenAPI document. See [OpenAPI](README.md#openapi).

### Fixes

- **`invoke()` on an endpoint with a single `output` schema is typed as the parsed body it returns**, not as an `EndpointResponse`.
- **The OpenAPI document gives an endpoint without `output` the 200 status it answers with**, not 201.
- **A shared schema used in both requests and responses appears in the OpenAPI document once per shape, as `<id>` and `<id>Output`.**
- **A `.nullish().default(...)` field wrapped in `z.preprocess(...)` is no longer marked `required`** in the generated OpenAPI document, matching the same field declared without `preprocess`.
- **Router middleware no longer emits `LegacyRouteConverter` deprecation warnings.**
- **File-based routing now works when the project path contains a space**, and on Windows.
- **`ApiQueries` accepts `z.preprocess(...)` schemas under zod 4.6.**

### Breaking changes

- **`endpoint()` is replaced by `endpoint.query()` and `endpoint.mutation()`, which decide whether the react-query client gives an operation query or mutation hooks.** Rename each `endpoint(` to the builder for its kind. See [Queries and mutations](README.md#queries-and-mutations).
- **Endpoints are POSTs by default, and `input` is always the JSON body.** Send a read's input as the body, or add `method: 'get'` to an endpoint that must stay a GET and declare its input as `query`.
- **This package is now ESM-only.** Set `"type": "module"` in your project; CommonJS is no longer supported.
- **`setupOpenAPI` is removed.** Build the document with `@nestjs/swagger`'s `SwaggerModule.createDocument()`, which finds everything it needs on the endpoints. See [OpenAPI](README.md#openapi).
- **NestJS >= 12 is required, and `@nestjs/swagger` >= 12 where it is installed.** Run `nest upgrade` to migrate.
- **Node.js >= 24.22 is required.**
- **TypeScript >= 6 is required.**
- **The library is set up with `NestjsEndpoints.forRoot` in the app's root module, and an app that imports several routers does not start without it.** Replace the app module's `EndpointRouterModule.create({ … })` with `NestjsEndpoints.forRoot({ router: { … } })`. See [Setup](README.md#setup).
- **Under Vitest, file-based routing needs `nestjs-endpoints` in `server.deps.inline`.** Add it to each of your Vitest configs. See [Vitest](README.md#vitest).
- **A `.` in an endpoint file or folder name splits the URL into segments, and a leading `$` makes a path parameter.** Set `path` on an endpoint whose URL must keep the dot or the `$`.
- **Generated client methods and hooks take one object that groups the request into `path`, `query` and `body`.** Change `client.userCreate({ name })` to `client.userCreate({ body: { name } })`, and `mutateAsync({ data })` to `mutateAsync({ body })`. See [Codegen](README.md#codegen-optional).
- **The react-query client's hooks are on the client object, not top-level exports.** Replace `useUserCreate()` with `useApiClient().useUserCreate()`. See [react-query](README.md#react-query).
- **Generated clients cover endpoints only.** Call the routes of plain Nest controllers through `client.axios`, or generate a client for them from the OpenAPI document. See [OpenAPI](README.md#openapi).
- **`orval` is no longer installed with the package.** Add it to your own dependencies if you run it against the OpenAPI document.
- **Each client is written as its `outputFile` plus a folder of the same name beside it.** Commit or ignore the folder with the file, and import only from the file.
- **Generated client calls take no per-call `headers`.** Set request headers on the client's axios instance, `client.axios`.
- **Generated client calls resolve to `{ status, data, error, headers, … }` and throw a `ResponseError`, not an `AxiosResponse` and an `AxiosError`; so do react-query hooks' errors.** Read `error.status` and `error.data` instead of `error.response.status` and `error.response.data`. See [Codegen](README.md#codegen-optional).
- **A call's axios config goes in its object, under `options`, not in a second argument.** Change `client.userFind({ id }, { timeout: 5000 })` to `client.userFind({ body: { id }, options: { timeout: 5000 } })`.
- **Response interceptors on `client.axios` see every status as a success, with the body not yet decoded.** Handle a failed call where it throws its `ResponseError`.
- **The generated clients type-check with the `dom` lib.** Add `"dom"` to `lib` in a Node-only project's tsconfig.
- **A react-query client's `options` are [`@kubb/plugin-react-query` 5's](https://kubb.dev/extensions/kubb-labs/plugin-react-query/options), not orval's.** Rewrite the ones you pass.
- **The react-query client requires `@tanstack/react-query` >= 5.82, and every client `axios` >= 1.20.**
- **Query keys are `[{ url, params? }, query?, body?]`.** Build a key you wrote by hand with the operation's `queryKey(...)`. See [react-query](README.md#react-query).
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
