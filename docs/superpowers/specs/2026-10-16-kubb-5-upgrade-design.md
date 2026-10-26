# Kubb 5 upgrade

**Date:** 2026-10-16
**Status:** Implemented
**Scope:** `packages/nestjs-endpoints/src/codegen`, test apps, example.
Breaking change for consumers of the generated clients.

## Goal

Move codegen from Kubb 4.39 (the last 4.x) to Kubb 5, and stop shipping the
`.kubb/config.ts` file Kubb 4's client plugin wrote into every output directory.
Nothing imports that file (it holds a multipart helper, and no operation uses
one), and no Kubb 4 option turns it off.

## Choices

### `@kubb/plugin-client` against our own runtime

Kubb 5 has three client plugins. `@kubb/plugin-axios` and `@kubb/plugin-fetch`
bundle their own runtime into `.kubb/` (`client.ts`, `serializers.ts`,
`standardSchema.ts`), with their own result shape (`{ status, data, error, … }`)
and error class. `@kubb/plugin-client` generates the request functions against
a module we name (`importPath`) and writes nothing else.

We use `plugin-client`, pointed at the `client-runtime.ts` we already emit:

- No `.kubb/` directory at all.
- Calls keep resolving to `AxiosResponse` and rejecting with `AxiosError`, so
  error handling in consumer code is unchanged.
- One client set serves both the axios methods and the hooks. Under Kubb 4 the
  react-query output needed two client plugins (`clients/` with
  `dataReturnType: 'data'` for the hooks, `axios-clients/` with `'full'` for
  the methods), because a client's return type was coupled to its hooks. Kubb 5's
  hooks read `.data` off whatever `plugin-client` returns.

`@kubb/plugin-react-query` accepts `plugin-client` as its client. Its docs only
name the axios and fetch plugins, but its client resolution
(`resolveClient`) lists `plugin-client` and auto-selects it when it is the only
client registered.

### The runtime contract

`client-runtime.ts` exports what `plugin-client` and the hooks import: `client`,
`Options`, `RequestResult`, `RequestConfig`, `ResponseErrorConfig`. `client`
receives the method, the url template (`/recipes/{recipeId}`) and the grouped
`path` / `query` / `body` / `headers`, and sends it with axios: placeholders are
filled (URI-encoded) from `path`, `query` becomes `params`, `body` becomes
`data`. `throwOnError: false` resolves on any status. `security` is ignored:
credentials belong on the axios instance.

### Binding hooks to the provider's client

`bindHook` injects the bound client into a hook's trailing options. Kubb 4 hooks
put that options object at `hook.length`. Kubb 5 query hooks with only optional
request data default that argument (`({ query } = {}, options = {})`), so
`length` is 0 while the options sit at index 1. The wrapper therefore passes the
index: 1 for a query hook whose operation has path, query or header parameters
or a request body (Kubb's own rule for emitting the request argument), else 0.
Mutation hooks take their request through `mutate()`, so theirs is 0. Which
methods are queries comes from the consumer's `query.methods` option (default
`GET`).

### Config

- `createKubb` from the `kubb` package (the plugins declare it as a peer), with
  `adapterOas({ integerType: 'number' })`: Kubb 5 maps `int64` to `bigint` by
  default, which JSON does not carry.
- `hooks: true` is forced and omitted from the public `options` type, as
  `client` is: the wrapper binds the `use*` hooks.
- Root barrel off, per-directory barrels on (the wrapper imports `clients`,
  `hooks` and `types` barrels). Format and lint off, as before.
- Kubb 5's telemetry is sent by its CLI commands only; `createKubb` sends none.

### Release-age gate

Kubb 5 publishes several releases a day, so a current set of its packages rarely
clears pnpm 11's one-day `minimumReleaseAge`. The exact versions are listed in
`minimumReleaseAgeExclude` (root workspace and the example), to be updated with
each bump.

## Consumer impact

- Every generated method and hook takes one grouped object:
  `client.recipesEdit({ path: { recipeId }, body: { name } })`,
  `useGreet({ query: { name } }, options)`, `mutate({ path, body })`.
- Per-operation type names follow Kubb 5 (`*Status200`, `*Options`, `*Path`,
  `*Query`, `*Body`); schema types keep their names.
- `@tanstack/react-query` >= 5.82.
- Suspense hooks are no longer generated unless enabled through `options`
  (Kubb 5's default). They were never exposed on the client object.
