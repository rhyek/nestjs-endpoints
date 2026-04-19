# Changelog

## 3.0.0 (2026-04-19)

### Features

- **Namespaces**: `namespace?: boolean | string` on `EndpointRouterModule.create()` nests generated SDK hooks/methods into an `api` object that mirrors the router hierarchy (`api.shop.recipes.useCreate(...)`).
- **Namespace-filtered clients**: `setupCodegen` accepts `namespaces?: string[]` per client — each filtered client ships only operations and schemas belonging to the listed top-level namespaces.
- **Built-in docs viewer**: `openapi.ui?: { path, options? }` mounts an API reference at `path` using the same doc the codegen consumes. Uses [Scalar](https://scalar.com) when `@scalar/api-reference` is installed (optional peer dep); falls back to Swagger UI otherwise.

### Breaking changes

- **Generated client surface**: each output file now exports a single `api` object (plus `type ApiClient`). Setup primitives live on it (`api.createAxiosClient` / `api.createReactQueryClient` / `api.Provider` / `api.useAxios`); operations live at `api.<name>` or inside a namespace bucket. The raw orval output is still generated as a sibling `*.flat.ts[x]` file but is now an internal artifact — don't import from it.

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
