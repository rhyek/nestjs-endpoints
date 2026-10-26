# Codegen from the endpoints' zod schemas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate the axios and react-query SDKs from each `endpoint()`'s zod schemas through a custom Kubb adapter, with one converter (zod-openapi's `createSchema` plus our overrides) shared by the SDK and the OpenAPI document.

**Architecture:** `endpoint()`'s `setupFn` converts its schemas once with `toJsonSchema` and stores an `EndpointDescriptor` on the class. `setupCodegen` collects the app's descriptors, merges their shared schemas, and feeds them to Kubb through `adapterEndpoints` (descriptors → Kubb AST); `plugin-ts`, `plugin-client`, `plugin-react-query`, the wrapper and the runtime emit the client as before. `setupOpenAPI` builds the document from the same conversions and merged schemas.

**Tech Stack:** TypeScript 6, NestJS 12, zod 4.6, zod-openapi 6, Kubb 5.11 (`kubb`, `kubb/kit`, `@kubb/ast`, `@kubb/plugin-ts`, `@kubb/plugin-client`, `@kubb/plugin-react-query`), vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-25-zod-direct-codegen-design.md`

## Global Constraints

- **Never commit.** Every task ends with its changes left uncommitted and a report of the diff. Subagents get the same instruction. No AI attribution anywhere.
- Unit tests: `pnpm --filter nestjs-endpoints test run <path>`. Full gate: `pnpm test` from the repo root (build, unit, codegen, `tscheck`, e2e for every test app).
- e2e specs are written only in `packages/test/test-app-express/test`; `scripts/test.sh` copies them to `test-app-fastify`.
- Test files are `*.spec.ts(x)`; every case uses `test(...)`, never `it(...)`.
- Kubb packages are pinned to exact versions. `@kubb/ast@5.11.0` is already in `minimumReleaseAgeExclude` (root `pnpm-workspace.yaml` and `examples/file-based-routing/pnpm-workspace.yaml`); nothing to add there.
- `zod-openapi` stays a dependency; the `zod` peer range stays `>=4.1.0`.
- `io: 'input'` for `input` and `params`, `io: 'output'` for every `output` status.
- Date overrides, verbatim: input `{ oneOf: [{ type: 'string', format: 'date-time' }, { type: 'string', format: 'date' }] }`; output `{ type: 'string', format: 'date-time' }`.
- bigint without `.meta({ type })` throws: `bigint cannot travel as JSON at <path>; give it .meta({ type })`, `<path>` without zod-openapi's wrapper segments, `(root)` for the root.
- Shared-schema renaming: input/output conversions of one id that differ → `<id>` (input) and `<id>Output` (output).
- Generated wrapper's first line: `// nestjs-endpoints: <sha256 hex>`.
- User-facing docs (README, `packages/nestjs-endpoints/docs/agents.md`, `packages/nestjs-endpoints/assets/skill.md`) describe current behaviour only: no "now", "no longer", "previously". Changelog entries go in the top section of `CHANGELOG.md`, one bold sentence each, `_(Breaking: …)_` where breaking.
- No mention, anywhere in code, docs, specs or plans, of any other project consulted.

## Review Focus

1. **A shared id that differs only by `additionalProperties`.** `profile/update.endpoint.ts` uses `ProfileAddress` in input and output; zod adds `additionalProperties: false` only on output, so the two differ and the client gains `ProfileAddressOutput`. A reader expects the rename to be deliberate and its refs consistent everywhere (document, AST, `schemas.ts`). Pinned in Task 4 and Task 9.
2. **A GET whose `input` is a `z.preprocess`/pipe object.** Its query parameters must still be split from the converted object (`cea92a2` fixed this path once). Pinned in Task 2.
3. **A nullable date in a GET query.** It converts to a nested `oneOf`; the adapter must type it `string | null`, and the query parameter stays optional/required as zod says. Pinned in Task 1 and Task 6.
4. **Re-running codegen with nothing changed.** A user expects no rewrite (no file churn under watch mode); only a schema, client config or version change regenerates. Pinned in Task 8 (hash) and Task 9 (files untouched).
5. **Two apps in one process.** e2e suites create several apps; each app's SDK and document hold only that app's endpoints. Pinned in Task 3.

---

### Task 1: The shared converter `toJsonSchema`

**Files:**
- Modify: `packages/nestjs-endpoints/src/zod-to-openapi.ts`
- Test: `packages/nestjs-endpoints/src/zod-to-openapi.spec.ts`
- Docs: `README.md` (section "Handling ZodEffects in output schemas"), `packages/nestjs-endpoints/docs/agents.md` §6.4

**Interfaces:**
- Produces:
  - `export type SchemaIo = 'input' | 'output'`
  - `export type JsonSchema = Record<string, unknown>`
  - `export function toJsonSchema(schema: ZodType, io: SchemaIo, ref?: string): { schema: JsonSchema; components: Record<string, JsonSchema> }` — with `ref`, the schema is given `.meta({ id: ref })` first, as `zodToOpenApi` does today, so `schema` is `{ $ref: '#/components/schemas/<ref>' }`.
  - `zodToOpenApi` keeps its signature and calls `toJsonSchema`. (It still writes `settings.openapi.components.schemas` until Task 5.)

- [ ] **Step 1: Write the failing tests** in `zod-to-openapi.spec.ts`, under `describe('toJsonSchema')`:
  - `test('input date is an ISO date-time or date')`: `toJsonSchema(z.coerce.date(), 'input').schema` equals the input date override verbatim; `z.fromJSONSchema(thatSchema)` accepts `'2024-01-01'` and `'2024-01-01T10:00:00Z'`, rejects `'Jan 1 2024'`.
  - `test('output date is a date-time')`: `toJsonSchema(z.date(), 'output').schema` equals `{ type: 'string', format: 'date-time' }`.
  - `test('nullable input date nests')`: `toJsonSchema(z.object({ d: z.coerce.date().nullable() }), 'input').schema.properties.d` equals `{ oneOf: [<input date override>, { type: 'null' }] }`.
  - `test('bigint without a type throws with its path')`: `toJsonSchema(z.object({ b: z.bigint() }), 'input')` throws `'bigint cannot travel as JSON at properties.b; give it .meta({ type })'`; at the root the path reads `(root)`.
  - `test('bigint keeps its meta type')`: `z.object({ b: z.coerce.bigint().meta({ type: 'string' }) })` → `properties.b` equals `{ type: 'string' }` (no `format`).
  - `test('unions are oneOf')`: `z.union([z.string(), z.number()])` → `oneOf`, no `anyOf`.
  - `test('meta id lands in components')`: an object with `.meta({ id: 'Addr' })` → `schema.properties.a` is `{ $ref: '#/components/schemas/Addr' }` and `components.Addr` is its schema.
  - `test('zod-openapi meta override still applies')`: `z.string().meta({ override: { format: 'email' } })` → `format: 'email'`.
  - `test('ref names the schema')`: `toJsonSchema(z.object({}), 'output', 'XOutput')` → `schema` is the `$ref`, `components.XOutput` exists.
- [ ] **Step 2: Run** `pnpm --filter nestjs-endpoints test run src/zod-to-openapi.spec.ts` — expect the new cases to FAIL (`toJsonSchema` is not exported).
- [ ] **Step 3: Implement `toJsonSchema`** in `zod-to-openapi.ts`: `createSchema(s, { io, openapiVersion, opts: { override } })`, where `override` applies, in order: `anyOf` → `oneOf` (as today); `def.type === 'date'` → the date override for `ctx.io`; `def.type === 'bigint'` → read `z.globalRegistry.get(ctx.zodSchema)?.type`. zod visits a schema with `.meta()` twice at the same path (first without the meta), so collect bigint paths with no meta type in a `Set` keyed by the path with zod-openapi's first two segments (`properties > zodOpenApiCreateSchema`) dropped and joined by `.`; delete the key when a later visit at that path has a type, and then set `jsonSchema.type` to it and delete `format`; after `createSchema` returns, throw if the set is non-empty, naming every remaining path. Return `{ schema, components }`.
- [ ] **Step 4: Run** the same command — expect PASS, including the file's existing cases.
- [ ] **Step 5: Docs.** In the README section on ZodEffects and agents.md §6.4, add: dates convert to an ISO date-time or date in requests and an ISO date-time in responses; a `z.bigint()` needs `.meta({ type })` saying what travels. Add to `CHANGELOG.md`: `**A \`z.bigint()\` in an endpoint schema needs \`.meta({ type })\`.** _(Breaking: it throws at startup without one.)_`
- [ ] **Step 6: Leave uncommitted;** report the diff.

### Task 2: `ApiQueries` and `ApiParams` split one conversion

**Files:**
- Modify: `packages/nestjs-endpoints/src/helpers.ts:120-200`
- Test: `packages/nestjs-endpoints/src/helpers.spec.ts`

**Interfaces:**
- Consumes: `toJsonSchema` (Task 1).
- Produces: `export function objectParameters(zodObject: ObjectSchemaLike): { name: string; required: boolean; schema: JsonSchema }[]` — converts the unwrapped object once with `toJsonSchema(source, 'input')` and returns one entry per `properties` key, `required` from the object's `required` list. `ApiQueries` and `ApiParams` map its result to `ApiQuery` / `ApiParam` (path parameters stay `required: true`). Task 3 uses it for descriptors.

- [ ] **Step 1: Write the failing tests:** `test('objectParameters splits one conversion')`: for `z.object({ a: z.string(), b: z.coerce.number().optional(), d: z.coerce.date() })` → names `['a','b','d']`, required `[true,false,true]`, `d`'s schema equals the input date override. `test('objectParameters unwraps preprocess')`: `z.preprocess((v) => v, z.object({ a: z.coerce.number() }))` → one entry `a`, required.
- [ ] **Step 2: Run** `pnpm --filter nestjs-endpoints test run src/helpers.spec.ts` — expect FAIL.
- [ ] **Step 3: Implement `objectParameters`** and rewrite `ApiQueries`/`ApiParams` on it, keeping the existing `ZodPipe`/`ZodTransform` unwrapping.
- [ ] **Step 4: Run** the same command — expect PASS with the existing cases.
- [ ] **Step 5: Leave uncommitted;** report the diff.

### Task 3: Endpoint descriptors

**Files:**
- Create: `packages/nestjs-endpoints/src/descriptors.ts`
- Modify: `packages/nestjs-endpoints/src/endpoint-fn.ts` (`setupFn`, around lines 700-790)
- Test: `packages/nestjs-endpoints/src/descriptors.spec.ts`

**Interfaces:**
- Consumes: `toJsonSchema` (Task 1), `objectParameters` (Task 2), `HttpMethod` from `src/codegen/http-methods.ts`.
- Produces (in `descriptors.ts`):
  ```ts
  export type ConvertedSchema = { json: JsonSchema; components: Record<string, JsonSchema> };
  export type EndpointDescriptor = {
    operationId: string;            // httpPathPascalName
    method: HttpMethod;
    path: string;                   // '/recipes/{recipeId}/view'
    pathParams: { name: string; schema: JsonSchema }[];   // from httpPath order; schema from params, else { type: 'string' }
    query?: { name: string; required: boolean; schema: JsonSchema }[];  // GET input split
    namespaceChain: string[];
    tags: string[];                 // exactly the tags given to ApiOperation (auto tag first)
    summary: string;
    input?: ConvertedSchema;        // GET: inline object; others: ref '<operationId>Input'
    outputs: { status: number; description?: string; schema: ConvertedSchema }[]; // ref '<operationId>Output' / '<operationId><status>Output'
  };
  export const DESCRIPTOR_METADATA_KEY = 'endpoints:descriptor';
  export function collectDescriptors(app: INestApplication): EndpointDescriptor[]; // the app's controllers via ModulesContainer, sorted by path then method
  export function filterDescriptors(descriptors: EndpointDescriptor[], namespaces: string[] | undefined): EndpointDescriptor[]; // top-level chain segment in namespaces; undefined → all
  ```
- `setupFn` builds the swagger decorators from the same `toJsonSchema` results it stores, so each schema is converted once per setup.

- [ ] **Step 1: Write the failing tests** in `descriptors.spec.ts`, building small apps with `Test.createTestingModule` and `endpoint({ path, ... })` controllers:
  - `test('path params from the route, typed by params')`: `path: '/r/:id/view'`, `params: z.object({ id: z.coerce.number() })` → `path === '/r/{id}/view'`, `pathParams` `[{ name: 'id', schema: { type: 'number' } }]`; without `params` the schema is `{ type: 'string' }`.
  - `test('GET input is split into query parameters')`: GET with `input: z.object({ q: z.string(), n: z.coerce.number().optional() })` → `query` names `['q','n']`, required `[true,false]`, `input.json` is the inline object.
  - `test('mutation input is a named body')`: POST → `input.json` is `{ $ref: '#/components/schemas/<operationId>Input' }`, `query` undefined.
  - `test('outputs by status')`: `output: { 201: schema(z.object({}), { description: 'Made' }), 400: z.string() }` → statuses `[201, 400]`, refs `…201Output`, `…400Output`, description kept.
  - `test('two apps each collect their own endpoints')`: two modules with different endpoints, two apps → each `collectDescriptors` returns only its own operationIds.
  - `test('filterDescriptors keeps listed top-level namespaces')`.
- [ ] **Step 2: Run** `pnpm --filter nestjs-endpoints test run src/descriptors.spec.ts` — expect FAIL.
- [ ] **Step 3: Implement** `descriptors.ts`; in `setupFn`, compute the conversions, build the decorators from them (`ApiBody({ schema })`, `ApiResponse({ schema })`, `ApiQuery`/`ApiParam` from the split lists), and `Reflect.defineMetadata(DESCRIPTOR_METADATA_KEY, descriptor, cls)` beside `endpoints:path`. `collectDescriptors` reads `app.get(ModulesContainer)`, every module's `controllers`, keeps classes carrying the metadata.
- [ ] **Step 4: Run** the same command, then `pnpm --filter nestjs-endpoints test run` — expect PASS.
- [ ] **Step 5: Leave uncommitted;** report the diff.

### Task 4: Merging shared schemas

**Files:**
- Create: `packages/nestjs-endpoints/src/shared-schemas.ts`
- Test: `packages/nestjs-endpoints/src/shared-schemas.spec.ts`

**Interfaces:**
- Consumes: `EndpointDescriptor` (Task 3).
- Produces:
  ```ts
  export type SharedSchemas = {
    schemas: Record<string, JsonSchema>;      // every component name → schema, output refs rewritten
    renamed: ReadonlyMap<string, string>;     // id → '<id>Output'
  };
  export function mergeSharedSchemas(descriptors: EndpointDescriptor[]): SharedSchemas;
  export function rewriteOutputRefs<T>(value: T, renamed: ReadonlyMap<string, string>): T; // deep copy, '#/components/schemas/<id>' → '…/<id>Output'
  export function reachableSchemas(roots: unknown[], shared: SharedSchemas): Record<string, JsonSchema>; // names reachable by $ref from roots, transitively
  ```
- Equality is canonical JSON (object keys sorted).

- [ ] **Step 1: Write the failing tests:**
  - `test('equal conversions are one schema')`.
  - `test('input and output differences get an Output twin')`: one `.meta({ id: 'Address' })` with `country: z.string().default('GT')` in one endpoint's input and another's output → `schemas.Address.required` is `['city']`, `schemas.AddressOutput.required` is `['city','country']`, `renamed.get('Address') === 'AddressOutput'`, and the output component referring to `Address` now refers to `AddressOutput`.
  - `test('additionalProperties alone makes a difference')`: an id used as-is in input and output → twin created (`additionalProperties: false` only on output).
  - `test('two schemas under one id in one direction throw')`: message names the id and two operationIds.
  - `test('reachableSchemas follows refs transitively')`.
- [ ] **Step 2: Run** `pnpm --filter nestjs-endpoints test run src/shared-schemas.spec.ts` — expect FAIL.
- [ ] **Step 3: Implement** `shared-schemas.ts`: gather input-direction components (from `input`, `params`) and output-direction ones (from `outputs`) separately per name, throw on a same-direction conflict, compare directions, rename and rewrite.
- [ ] **Step 4: Run** the same command — expect PASS.
- [ ] **Step 5: Leave uncommitted;** report the diff.

### Task 5: The OpenAPI document from the merged schemas

**Files:**
- Modify: `packages/nestjs-endpoints/src/setup-openapi.ts`, `packages/nestjs-endpoints/src/zod-to-openapi.ts`, `packages/nestjs-endpoints/src/consts.ts` (drop `settings.openapi.components`)
- Test: `packages/test/test-app-express/test/zod-openapi.e2e-spec.ts`

**Interfaces:**
- Consumes: `collectDescriptors` (Task 3), `mergeSharedSchemas`, `rewriteOutputRefs` (Task 4).
- Produces: `setupOpenAPI(app, options)` unchanged in signature; after `SwaggerModule.createDocument(app, config)` it sets `components.schemas` to `{ ...document.components?.schemas, ...mergeSharedSchemas(collectDescriptors(app)).schemas }` and runs `rewriteOutputRefs` over the `responses` of each operation whose `operationId` is a descriptor's. `zodToOpenApi` no longer writes `settings.openapi.components.schemas`.

- [ ] **Step 1: Write the failing test** in `zod-openapi.e2e-spec.ts`: `test('a shared id used in both directions gets an Output twin')` — an app with one POST whose input and output both use `z.object({ city: z.string(), country: z.string().default('GT') }).meta({ id: 'Address' })`; `setupOpenAPI(app)` → `components.schemas.Address.required` is `['city']`, `components.schemas.AddressOutput.required` is `['city','country']`, the 200 response schema refers to `AddressOutput`, the request body to `Address`.
- [ ] **Step 2: Run** `pnpm test` — expect that case to FAIL (both copies are `Address`).
- [ ] **Step 3: Implement** the post-processing in `setupOpenAPI` and remove the global components writes.
- [ ] **Step 4: Run** `pnpm test` — expect PASS for the express and fastify e2e suites.
- [ ] **Step 5: Changelog:** `**A shared schema used in both requests and responses appears in the OpenAPI document once per shape, as \`<id>\` and \`<id>Output\`.**`
- [ ] **Step 6: Leave uncommitted;** report the diff.

### Task 6: The Kubb adapter

**Files:**
- Create: `packages/nestjs-endpoints/src/codegen/kubb/adapter.ts`
- Test: `packages/nestjs-endpoints/src/codegen/kubb/adapter.spec.ts`
- Modify: `packages/nestjs-endpoints/package.json` (add `"@kubb/ast": "5.11.0"`)

**Interfaces:**
- Consumes: `EndpointDescriptor` (Task 3), `SharedSchemas`, `reachableSchemas`, `rewriteOutputRefs` (Task 4). Node types and `factory` from `@kubb/ast` (read its `dist/index.d.ts` for `SchemaNode` variants, `RefSchemaNode`, `createOperation`, `createParameter`, `createRequestBody`, `createResponse`, `createContent`, `createProperty`, `createSchema`, `createInput`).
- Produces:
  ```ts
  export function schemaToNode(schema: JsonSchema, at: { operationId: string; pointer: string }): SchemaNode;
  export function buildInputNode(params: { descriptors: EndpointDescriptor[]; shared: SharedSchemas }): InputNode;
  export function adapterEndpoints(kit: typeof import('kubb/kit'), input: InputNode): Adapter; // kit.defineExtension({ kind: 'adapter', meta: { name: 'nestjs-endpoints' }, build: () => ({ document: null, parse: () => input, validate: async () => {} }) })({})
  ```
- `buildInputNode` per descriptor: one `HttpOperationNode` (`method` upper-case, `path`, `operationId`, `tags`, `summary`, `extensions: { 'x-namespace': chain }` when the chain is non-empty); path `ParameterNode`s from `pathParams`, query ones from `query`; a JSON `RequestBodyNode` (required) for a mutation's `input`; one `ResponseNode` per output (output refs rewritten); a body-less response for the method's default status (`200`, `201` for POST) when there are no outputs. `InputNode.schemas`: `reachableSchemas` of this client's descriptors, each a named node.

- [ ] **Step 1: Write the failing tests** for `schemaToNode`, one per accepted construct in the spec's list: `type: 'string'` with `format`/`pattern`/`minLength`; `["string","null"]` → nullable string; `integer` with bounds; object with `properties`/`required` (optional flags on properties); `additionalProperties` and `propertyNames` (record); `items` and `prefixItems`; `anyOf`/`oneOf` → union, `allOf` → intersection; `enum`, `const`; `not: {}` → never; `{}` → unknown; `$ref` → `RefSchemaNode` with the name; `discriminator` ignored; the input date `oneOf` and its nullable nesting → a union whose generated type is `string` / `string | null`; `default`, `description`, `deprecated`, `readOnly` carried. `test('unsupported keyword throws with operation and pointer')`: `{ if: {} }` throws a message containing the operationId and `#/properties/x`.
  And for `buildInputNode`: `test('GET with path and query parameters')`, `test('mutation body references <operationId>Input')`, `test('outputs per status reference renamed ids')`, `test('no outputs → body-less default response')`, `test('only reachable shared schemas are included')`.
- [ ] **Step 2: Run** `pnpm --filter nestjs-endpoints test run src/codegen/kubb/adapter.spec.ts` — expect FAIL.
- [ ] **Step 3: Implement** `adapter.ts` with `@kubb/ast`'s `factory`.
- [ ] **Step 4: Run** the same command — expect PASS.
- [ ] **Step 5: Leave uncommitted;** report the diff.

### Task 7: Wrapper pieces read descriptors

**Files:**
- Modify: `packages/nestjs-endpoints/src/codegen/kubb/buckets.ts`, `operation-kind.ts`, `input-schemas.ts`, `wrapper.ts` and their specs (`buckets.spec.ts`, `operation-kind.spec.ts`, `input-schemas.spec.ts`, `wrapper.spec.ts`)
- Delete: `packages/nestjs-endpoints/src/codegen/kubb/document.ts` (move `normalizeOperationIdToPascal` and `operationSourceName` into `buckets.ts`), `packages/nestjs-endpoints/src/codegen/filter-doc.ts`

**Interfaces:**
- Consumes: `EndpointDescriptor` (Task 3), `SharedSchemas` (Task 4).
- Produces:
  - `buildClientObjectExpression({ descriptors, tagDescriptions, plainAccess, hookAccess, rootExtras, indent? })` — `tagDescriptions: Map<string, string>` from `settings.openapi.tags`; `hasRequest` is `pathParams.length > 0 || input !== undefined`.
  - `operationKinds(descriptors, options)` — filters as today: `tag` over `descriptor.tags`, `operationId`, `path` (the `{param}` form), `method`, `contentType` (`application/json` when there is a mutation input), `extension` over `{ 'x-namespace': chain }`.
  - `collectInputSchemas(descriptors, shared): Map<string, InputSchemaEntry>` — `kind: 'query'` for a GET, `'body'` otherwise; `schema` is the descriptor's `input.json` with refs resolved against `shared.schemas` (reuse `resolveRefs` with `{ components: { schemas: shared.schemas } }` as its document).
  - `buildAxiosWrapperSource` / `buildReactQueryWrapperSource` take `descriptors` (and `shared` for the `ownsInputSchema` check over `shared.schemas` names) in place of `document`.

- [ ] **Step 1: Rewrite the specs' fixtures** from OpenAPI documents to descriptors, keeping every assertion; in `input-schemas.spec.ts`, retire the cases about reassembling query parameters and add `test('GET input keeps object-level keywords')` (an input object with `.describe('Filters')` and `.strict()` → `description` and `additionalProperties: false` present in `schemas.input`).
- [ ] **Step 2: Run** `pnpm --filter nestjs-endpoints test run src/codegen` — expect FAIL.
- [ ] **Step 3: Implement** the signature changes and delete `document.ts` and `filter-doc.ts`.
- [ ] **Step 4: Run** the same command — expect PASS.
- [ ] **Step 5: Leave uncommitted;** report the diff.

### Task 8: `setupCodegen` on the adapter, with hash change detection

**Files:**
- Modify: `packages/nestjs-endpoints/src/codegen/kubb/generate.ts`, `packages/nestjs-endpoints/src/codegen/setup.ts`, `packages/nestjs-endpoints/package.json` (remove `@kubb/adapter-oas`), `pnpm-lock.yaml`
- Create: `packages/nestjs-endpoints/src/codegen/hash.ts`
- Test: `packages/nestjs-endpoints/src/codegen/hash.spec.ts`
- Docs: `README.md` "Codegen (optional)", agents.md §2.4, §6, §8, §9.2 (and its `schemas.input` paragraph), `packages/nestjs-endpoints/assets/skill.md` description, `CHANGELOG.md`

**Interfaces:**
- Consumes: Tasks 3, 4, 6, 7.
- Produces:
  - `generateAxiosClient({ descriptors, shared, outputFile, hash })` and `generateReactQueryClient({ descriptors, shared, outputFile, options, hash })`; `runKubbBuild` passes `adapter: adapterEndpoints(kit, buildInputNode(...))` and whatever inline `input` Kubb's `UserConfig` requires (the adapter ignores it). The wrapper source is prefixed with `// nestjs-endpoints: ${hash}\n`.
  - `clientHash(params: { descriptors: EndpointDescriptor[]; shared: Record<string, JsonSchema>; client: { type: string; namespaces?: string[]; options?: unknown }; version: string }): string` — sha256 hex of canonical JSON.
  - `readClientHash(outputFile: string): Promise<string | undefined>` — the first line's hash, `undefined` when missing.
  - `setupCodegen(app, params): Promise<{ document?: OpenAPIObject }>` — calls `setupOpenAPI` only when `params.openapi` is given; regenerates a client when `forceGenerate`, its wrapper or output dir is missing, or `readClientHash` differs from `clientHash`.

- [ ] **Step 1: Write the failing tests** in `hash.spec.ts`: `test('stable across runs')`; `test('changes with a schema')`; `test('changes with namespaces or options')`; `test('changes with the version')`; `test('readClientHash reads the header')` (temp file).
- [ ] **Step 2: Run** `pnpm --filter nestjs-endpoints test run src/codegen/hash.spec.ts` — expect FAIL.
- [ ] **Step 3: Implement** `hash.ts`, rewire `generate.ts` and `setup.ts`, drop `@kubb/adapter-oas`, `pnpm install`.
- [ ] **Step 4: Run** `pnpm test` — expect PASS; the generated clients of the test apps lose `vanillaControllerGetNull` / `vanillaControllerPostNull` and gain `ProfileAddressOutput`; fix any spec that named the vanilla operations through the client.
- [ ] **Step 5: Docs.** README Codegen: the SDK is generated from the endpoints' zod schemas, the OpenAPI document is for the docs UI and other generators and is written only when `openapi` is given, plain controllers are not in the SDK. agents.md: the same in §6 and §8; §2.4 `headers` is never set by codegen; §9.2 `schemas.input` comes from the endpoint's `input` conversion. skill.md description: name the SDK's source if it does. Changelog: `**Generated clients cover \`endpoint()\`s only.** _(Breaking: routes from plain Nest controllers leave the SDK.)_` and `**\`setupCodegen\` writes the OpenAPI document only when \`openapi\` is given.** _(Breaking: no default file is written.)_`
- [ ] **Step 6: Grep** README, `docs/`, agents.md, skill.md for `adapter-oas`, `filter`, `x-namespace`, `openapi.json`, `__generated-openapi` and reconcile every hit.
- [ ] **Step 7: Leave uncommitted;** report the diff.

### Task 9: End-to-end proof that types and schemas match the zod schemas

**Files:**
- Create: `packages/test/test-app-express/test/codegen-types.e2e-spec.ts`
- Modify: `packages/test/test-app-express/src/endpoints/profile/update.endpoint.ts`, `greet.endpoint.ts`, `recipes/edit/$recipeId.endpoint.ts`, `user/appointment/_endpoints/create/endpoint.ts` (export their schemas as named constants, used by the default export unchanged)
- Test: `packages/test/test-app-express/test/client.e2e-spec.ts` (add the `schemas.input` deep-equal case if it fits there; else in the new file)

**Interfaces:**
- Consumes: the generated `generated/react-query-client.tsx` types (`<Op>Options`, `<Op>MutationResponse` / response types as Kubb names them), `toJsonSchema` (Task 1), `reachableSchemas`/ref resolution as `schemas.ts` does it.

- [ ] **Step 1: Write the tests:**
  - `test('generated request types equal the zod input types')`: `expectTypeOf<NonNullable<ProfileUpdateOptions['body']>>().toEqualTypeOf<z.input<typeof profile>>()`; the same for `greet`'s `query`, `recipesEdit`'s `path` against `z.input<typeof recipeParams>` and its `body`.
  - `test('generated response types equal the zod output types')`: per status for the appointment create endpoint (201 and 400) against `z.output<…>`.
  - `test('schemas.input is the endpoint conversion')`: for `profileUpdate` and `greet`, `api.<op>.schemas.input` deep-equals `toJsonSchema(schema, 'input')` with refs resolved.
  - `test('ProfileAddress has an Output twin in the client')`: the generated types export both `ProfileAddress` and `ProfileAddressOutput`.
  - `test('setupCodegen without openapi writes no document')`: run `setupCodegen` with one axios client into a temp dir and no `openapi`; it returns `{ document: undefined }`, and no `__generated-openapi.json` exists beside the built `setup.js` of `nestjs-endpoints` (`dist/codegen/`).
  - `test('a second run with nothing changed leaves the client alone')`: run the same `setupCodegen` twice; the wrapper's and `client-runtime.ts`'s `mtimeMs` are equal after the second run.
- [ ] **Step 2: Run** `pnpm test` — expect PASS for express and fastify.
- [ ] **Step 3: Leave uncommitted;** report the diff.
