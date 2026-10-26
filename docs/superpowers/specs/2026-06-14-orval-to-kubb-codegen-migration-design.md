# Codegen migration: orval → Kubb

**Date:** 2026-06-14
**Status:** Approved design — ready for implementation plan
**Scope:** `packages/nestjs-endpoints/src/codegen/*` (the only deployable). Internal-only change.

## Goal

Replace orval with Kubb as the engine behind `setupCodegen`, eliminating the
brittle string/regex post-processing the orval integration requires, while
keeping the library's **external API and all generated-client behavior
byte-compatible** from a consumer's perspective. This is an internals
refactor: nobody using the library should have to change a line.

## Why

The orval integration is forced into regex surgery on generated output because
orval exposes generated code as *strings*, not a structured model:

- `builder/react-query.ts` — ~7 sequential `result.implementation.replace(/…/)`
  rewrites (inject the per-instance client, rewrite return statements, rewrite
  `Awaited<ReturnType<…>>` types, etc.). Has already broken on new endpoint
  shapes (path params) and carries comments documenting those breakages.
- `builder/axios.ts` — footer regex rewriting orval's `return {…}` to append
  `axios`.
- `wrapper.ts` — a second, hand-rolled codegen pass that re-reads the OpenAPI
  document and string-concatenates the namespaced client, because the nested
  `client.shop.recipes.create` shape is not expressible in orval.
- `name-transform.ts` — lenient PascalCase prefix *stripping* that exists only
  to reverse-engineer orval's flat names back into public property names.

Kubb's plugin model exposes a structured *fabric* (the in-memory model of
emitted files and their exportable symbols). A custom plugin reads that fabric
and emits additional files from real symbol metadata — no regex, no guessing
generator naming.

## Constraints — what must NOT change

These are asserted by the existing test suites (behavior + types; no test
snapshots generated source, so generated *text* may change freely).

### Public API of `setupCodegen`
```ts
setupCodegen(app, {
  openapi?: SetupOpenAPIOptions;
  clients: ({
    outputFile: string;
    namespaces?: string[];          // empty array still rejected as ambiguous
  } & (
    | { type: 'axios' }
    | { type: 'react-query'; options?: <Kubb react-query options> }  // re-typed (was orval QueryOptions)
  ))[];
  forceGenerate?: boolean;
}): Promise<{ document }>
```
`setupOpenAPI` and `SetupOpenAPIOptions` stay exactly as they are (public,
re-exported from the package index).

### Generated client surface (per output file)
- **axios** output exports `createApiClient` and an `ApiClient` type.
- **react-query** output additionally exports `useApiClient` and
  `ApiClientProvider`.
- `createApiClient(config?: CreateAxiosDefaults | AxiosInstance)` — accepts
  either axios config **or** an already-constructed axios instance.
- The returned client is a **nested object mirroring the router hierarchy**:
  un-namespaced ops at root, namespaced ops under buckets
  (`client.shop.cart.add`), with `.axios` exposing the underlying instance at
  the root.
- **react-query**: every bucket carries the axios method *and* the paired hook
  side by side (`client.shop.cart.add` and `client.shop.cart.useAdd`;
  `client.authLogin` and `client.useAuthLogin` at root).
- Per-client `namespaces` filter: a filtered client exposes only the requested
  top-level namespaces plus `axios`, and ships only the schemas its operations
  reference.

### Behavior contracts (verified against the e2e tests)
- **axios methods return the full `AxiosResponse`** — callers destructure
  `.data`, and a non-2xx rejects with `.response.status`. (Kubb
  `dataReturnType: 'full'`.)
- **react-query hooks return unwrapped data.**
- Hooks obtain their axios instance from `useApiClient()` (React context), so
  multiple independent clients (e.g. namespace-filtered ones) coexist.

### Method/property names
The public names (`userGet`, `userCreate`, `authLogin`, `shop.cart.add`,
`shop.cart.useAdd`, …) MUST stay byte-identical. See "Naming" below for how.

## Non-goals
- No change to `setupOpenAPI`, the OpenAPI document content, or
  `filter-doc.ts` (namespace filtering + schema pruning).
- No change to the router/endpoint runtime, file-based routing, or any
  non-codegen code.
- No new features. YAGNI: we port the existing surface, nothing more.

## Architecture (Approach A)

### 1. The unchanged half
`setupCodegen`'s outer control flow is preserved: resolve the openapi output
file (default `__generated-openapi.json` beside `setup.ts`), call
`setupOpenAPI` for `{ document, changed }`, gate generation on
`forceGenerate || changed || !outputFileExists`, loop per client, and
`filterOpenApiDocByNamespaces(document, client.namespaces)` for each. Only the
*engine* inside the loop changes.

### 2. Kubb pipeline (per client) — fully in-memory, single pass, no scratch files
Invoked in-process via `@kubb/core`'s `build({ config })` (same model as
today's in-process `orval.generate()`). The whole pipeline is in-memory and
single-pass — there is **no intermediate file that we write, manipulate, or
delete**:

- **Input is the in-memory document** — `input: { data: filteredDoc }`. The
  namespace-filtered document object is handed straight to Kubb; nothing is
  written to feed it. (Confirmed against `@kubb/core@4.x`: `InputData = { data:
  string | unknown }`, and the official runtime docs.)
- **Output** targets a **sibling directory** beside `outputFile`, written by
  the default `fsStorage` in one pass. `output.clean` prunes stale files in
  Kubb's *own* output dir (Kubb pruning its own output — not a post-process we
  run). `memoryStorage()` exists too (build returns the files), but since the
  generated client must land on disk for consumers/tests, `fsStorage` writing
  once is the right choice.

Plugins (composed in one pipeline — nothing is generated-then-rewritten):
- `@kubb/plugin-oas` — parser (no standalone JSON-schema files).
- `@kubb/plugin-ts` — request/response types.
- `@kubb/plugin-client` — flat request **functions** (`clientType: 'function'`
  — required by the query plugin), `dataReturnType: 'full'`, `importPath` → the
  thin runtime module (below).
- `@kubb/plugin-react-query` — hooks (react-query clients only),
  `client.importPath` → the same runtime, `client.dataReturnType: 'data'`.
- **`pluginNamespacedClient`** (custom) — emits the final wrapper INTO the
  pipeline via the fabric's `addFile` (see below). Kubb writes it alongside the
  rest in the same pass.

### 3. `pluginNamespacedClient` (the one custom plugin)
Runs after the OAS parse + client/react-query generation (declares them as
`pre`). It:
1. Reads operations from the parsed OAS (operationId, `x-namespace`, tags).
2. Reads the **real emitted symbol names** for each operation's request
   function and hook from `this.fabric` (never guesses Kubb's naming).
3. Computes the **public property name** for each op from `operationId` +
   `x-namespace` using our own canonical transform (the kept half of
   `name-transform.ts`).
4. Emits the public entry: `createApiClient` (axios binding + `.axios`
   passthrough + nested buckets) and, for react-query, `useApiClient` +
   `ApiClientProvider` + paired hooks. Tag descriptions become bucket JSDoc, as
   today.

This single plugin replaces `wrapper.ts` and both regex builders.

### 4. Thin runtime module
A small module the generated client imports, holding the axios + React-context
plumbing so generated code stays generator-clean:
- the axios-backed request implementation used as Kubb's `client`;
- `createApiClient` binds a per-instance axios (config or passed instance) into
  the calls — so each client closes over its own instance (model required by
  namespace-filtered multi-client usage);
- React context (`ApiClientContext`) + `useApiClient()` for the hook path.

The exact wiring (whether the namespaced wrapper methods are thin closures that
inject the instance per call, vs. a bound-class shape) is settled in the axios
spike; the contract above is fixed regardless.

### 5. Public surface / file layout
The public `outputFile` (e.g. `generated/axios-client.ts`) is the entry the
plugin emits / re-exports from; Kubb's types + flat client live in a sibling
directory beside it. The consumer's import path and the file's exports are
identical to today. The only externally visible change is the on-disk
footprint next to `outputFile` (a folder instead of one `*.flat.ts`), which is
the accepted tradeoff.

`forceGenerate` cleanup is updated to wipe the sibling directory + the entry
file (replacing today's `*.flat.*` unlink).

## Naming — the load-bearing detail
Public names are computed **by us**, from `operationId` + `x-namespace`, using
the existing canonical normalization. They are never derived from the
generator's names. The custom plugin only needs each generator symbol's *real*
name to reference it, and reads that from the fabric. Therefore:
- Root-level names stay byte-identical (we reuse the already-tested logic).
- Kubb's internal naming convention is irrelevant to the public surface.

`name-transform.ts` keeps its public-name computation and its spec; the
flat-name reverse-engineering is dropped.

## `setupCodegen` control-flow deltas
- `import('orval')` → `import('@kubb/core')` (+ plugin imports). Still dynamic,
  so nothing loads unless codegen runs.
- `flatPathFor(outputFile)` → `siblingDirFor(outputFile)`.
- The per-client branch builds a Kubb config and calls `build()` instead of
  `generate()` + `writeNamespacedWrapper()`.
- The `options` field for react-query is typed to the Kubb react-query plugin's
  options and forwarded into that plugin's config.

## Dependencies
- Remove: `orval`, `@orval/query`.
- Add (as regular `dependencies`, mirroring orval today, dynamically imported):
  `@kubb/core`, `@kubb/plugin-oas`, `@kubb/plugin-ts`, `@kubb/plugin-client`,
  `@kubb/plugin-react-query`. Pin all `@kubb/*` to one matching version.
- **Target stable Kubb 4.x (latest `4.38.x`).** Kubb 5.x is still beta
  (`5.0.0-beta.x`, a different `createKubb`/`safeBuild` programmatic API); not
  adopted now, but the design is compatible with a later 5.x upgrade.
- `axios` / `@tanstack/react-query` / `react` peer expectations unchanged.

## Testing strategy
No test edits expected — none are orval-specific. The suites already pin the
contract:
- `client.e2e-spec.ts` — axios behavior (full response, rejection on non-2xx,
  instance vs config).
- `namespace-codegen.e2e-spec.ts` — nested shape + paired hooks + `.axios` +
  namespace filtering, as both runtime checks and compile-time type
  assertions.
- `path-params.e2e-spec.ts` — positional path-param method signatures.
- `packages/test/test-react-query-client` — real hook usage under React.
- `app.e2e-spec.ts` + the rest — unaffected (server-side), must stay green.

`scripts/test.sh` regenerates every `test-app-*` client via `run codegen`,
then runs tscheck + e2e across cjs/esm × express/fastify and the react-query
project. The migration is "done" only when that whole script passes unchanged.

## Rollout sequencing
Strictly incremental; orval stays installed until the very end.
1. **axios client** end-to-end (no hooks): pipeline + `pluginNamespacedClient`
   (axios path) + runtime, until `client.e2e-spec.ts` and the axios
   type-assertions in `namespace-codegen.e2e-spec.ts` pass.
2. **react-query client**: add the hooks path (context-client injection) until
   `namespace-codegen` react-query checks and the `test-react-query-client`
   project pass.
3. **Cutover**: delete `builder/axios.ts`, `builder/react-query.ts`,
   `wrapper.ts`, the dropped half of `name-transform.ts`; remove orval deps;
   regenerate all committed clients; full `scripts/test.sh`.

## Risks & mitigations
- **react-query context-client injection** (highest risk — where orval's worst
  regex lived). Mechanism: our wrapper hook (`useAdd`) calls `useApiClient()`
  in render, then forwards the instance into Kubb's hook through its
  **supported per-call `client` config** (`options.client` / `RequestConfig`)
  — a real config path, not string surgery. Mitigation: phase 2, proven
  against the real `test-react-query-client` project before cutover.
- **axios return TYPE parity.** Tests destructure `.data.id` and read
  `.response.status` on rejection, i.e. methods must return `AxiosResponse<T>`
  and reject (axios-style) on non-2xx. `dataReturnType: 'full'` types as a
  status-keyed union, so the runtime + wrapper re-expose each method as
  `AxiosResponse<SuccessType>` and the runtime throws on non-2xx. Verified in
  the axios spike (type-level, via the existing type-assertions + tsc).
- **Operation naming drift** breaking public method names. Mitigation: public
  names come from our own transform, not the generator; covered by
  `name-transform.spec.ts` and the e2e method calls.
- **Kubb plugin-API churn** (lower-level than orval's). Mitigation: pin one
  `@kubb/*` version; the only custom surface is one plugin, isolated behind our
  own naming logic.

## Resolved / confirmed against the docs + installed types
- In-memory input (`input: { data }`) — supported, so **no temp doc file**.
- `build()` returns the generated `files`; `memoryStorage`/`fsStorage` both
  exported — so the pipeline is fully programmatic and single-pass.
- `clientType: 'function'` is required by the query plugin; `importPath` lets us
  own the HTTP runtime (the lever for axios behavior + hook client injection).

## Open questions
None blocking. One item is an implementation detail settled in the axios spike
(not a design fork): the exact instance-binding shape of the runtime
(per-call `client` config vs. a bound wrapper).

## Implementation outcome (shipped)

Built end-to-end; all suites green (package unit 33; e2e 54 × express/fastify ×
cjs/esm; react-query project 6; real-run smoke). External API unchanged.

- **Engine.** `setupCodegen` runs `@kubb/core` `build()` in-process per client,
  input fed inline (`input.data`), output a sibling dir beside `outputFile`.
  Stable, pinned `@kubb/* 4.38.0` (5.x is still beta).
- **In-pipeline emit (no post-processing).** One inline `definePlugin` per build
  emits the runtime (into the dir) and the namespaced wrapper (at `outputFile`)
  via `addFile`; `output.clean` regenerates the dir each run. Nothing is
  read-then-edited and there are no stale files — the robustness goal.
- **axios** — `plugin-client` function mode, `dataReturnType: 'full'`, importing
  a self-contained axios runtime (`client-runtime.ts`). The wrapper binds the
  per-instance client into each op via `bindClient`, which forwards positional
  args and injects the client at index `fn.length` (the trailing optional
  `config`).
- **react-query** — Kubb couples a client's `dataReturnType` to its hooks, but
  the namespaced client needs imperative axios methods returning `AxiosResponse`
  *and* hooks returning unwrapped data. Resolved with **two `plugin-client`
  instances in one pass**: a `data` client (`clients/`, feeds the hooks) and a
  `full` client (`axios-clients/`, feeds the wrapper's axios methods) — both real
  and correctly typed, no runtime tricks. Hooks read their bound client from
  `ApiClientContext` via `bindHook` (forwarding through the hook's supported
  per-call `client` option). `output.barrelType: false` avoids a root-barrel
  collision between the two same-named client sets.
- **`options`** re-typed to `Omit<@kubb/plugin-react-query options, 'client'>`.
- **Consumer impact.** The react-query client now requires `@tanstack/react-query
  >= 5.80` (Kubb emits the modern `mutationOptions` helper). Documented in the
  README; test apps bumped to `^5.101.0`.
- **`.kubb/config.ts`** — `plugin-client` always emits this small helper file
  into its output dir. No config disables it; it is clean-regenerated each run
  (never stale) and harmless, so it is kept rather than deleted post-emit (which
  would reintroduce the post-emit-manipulation pattern this migration removes).
- **Shape changes vs. the original plan.** `name-transform.ts` was *kept* (the
  generated names match its normalization, so public names stay byte-identical
  and the flat reference names are computed directly — no fabric read was
  needed). `wrapper.ts` → `buckets.ts` (shared bucket logic); the two regex
  builders are deleted.
