# Codegen from the endpoints' zod schemas

**Date:** 2026-10-25
**Status:** Draft
**Scope:** `packages/nestjs-endpoints/src` (endpoint registration, `codegen/`),
test apps, README, agent guide, changelog. Breaking change for consumers of the
generated clients.

## Goal

The generated SDKs (axios and react-query) are built from the OpenAPI document
today: `setupCodegen` builds the document through `@nestjs/swagger`, and Kubb's
`@kubb/adapter-oas` reads it. Each endpoint's schemas reach the client after two
conversions, and `schemas.input` is reassembled from the document: a GET's input
is split into one query parameter per field by `ApiQueries`, then
`input-schemas.ts` puts the fields back together into one object schema.

Build the SDKs straight from each `endpoint()`'s zod schemas instead. The
operation types the methods, queries and mutations take and return, and
`schemas.input`, come from the same JSON Schema objects, converted once when
the endpoint is set up. The OpenAPI document stays, for the docs UI and for anyone driving
their own generator, but the SDK no longer reads it.

## Choices

### Kubb stays, behind our own adapter

Kubb 5 separates its input from its plugins: an adapter (`defineExtension` with
`kind: 'adapter'`) turns a source into Kubb's universal AST (`InputNode`), and
every plugin reads that AST. `@kubb/adapter-oas` is the built-in adapter for
OpenAPI. We add our own, `adapterEndpoints`, whose source is the endpoint
descriptors below. `@kubb/plugin-ts`, `@kubb/plugin-client`,
`@kubb/plugin-react-query`, our wrapper and our runtime keep emitting the client.

That keeps the react-query `options` that `setupCodegen` forwards to Kubb
(suspense and infinite queries, query keys, include, exclude, override) working
unchanged.

`@kubb/adapter-oas` does not export its JSON Schema → AST parser, so the adapter
has its own. It only has to cover the JSON Schema zod produces (below), not all
of OpenAPI. The AST nodes are built with `@kubb/ast`'s `factory`
(`createInput`, `createOperation`, `createParameter`, `createRequestBody`,
`createResponse`, `createSchema`, `createProperty`; its `createSchema` builds
an AST node and is unrelated to zod-openapi's).

Rejected: our own emitter in place of Kubb. Fewer dependencies and no Kubb pins,
but it gives up the forwarded react-query options and means writing the TS,
client and hook printers ourselves.

Rejected: building a minimal OpenAPI document from the zod schemas and feeding
it to `adapter-oas`. It keeps the document as the SDK's source, which is what
this change removes.

### One converter: zod-openapi's `createSchema`, with our overrides

Both the SDK and the OpenAPI document convert schemas with one function,
`toJsonSchema(schema, io)` (`src/zod-to-openapi.ts`, beside `zodToOpenApi`). It
calls zod-openapi's `createSchema` on one schema, with no document, and passes
our rules through its `opts.override` hook. `createSchema` is `z.toJSONSchema`
underneath, with the handling endpoints need and raw `z.toJSONSchema` lacks:
`z.date()`, `z.coerce.date()` and `z.bigint()` convert instead of throwing,
`.transform(…).meta({ type, format })` is honoured in outputs, and a transform
an output schema cannot represent throws with its path.

The overrides:

| zod | `io: 'input'` | `io: 'output'` |
| --- | --- | --- |
| `z.date()`, `z.coerce.date()` | `{ oneOf: [{ type: 'string', format: 'date-time' }, { type: 'string', format: 'date' }] }` | `{ type: 'string', format: 'date-time' }` |
| `z.bigint()`, `z.coerce.bigint()` | throws, unless `.meta()` gives a `type`, which is used | the same |
| a union (`anyOf`) | `oneOf` (as today) | `oneOf` |

- **Dates differ by direction.** A request date is an ISO date-time
  (`2024-01-01T10:00:00Z`, `2024-01-01T10:00:00.123-06:00`) or an ISO date
  (`2024-01-01`). A `date-time` format alone would refuse the plain date, and a
  client that validates against the schema (`z.fromJSONSchema` turns each
  `format` into a strict ISO check) would refuse it too. Each branch carries its
  own `type`: `z.fromJSONSchema` checks no `format` in a branch without one. A
  nullable date nests: `oneOf: [<the date oneOf>, { type: 'null' }]`. A
  response date is what `JSON.stringify` sends: an ISO date-time. zod-openapi
  alone gives `{ type: 'string' }` both ways.
- **bigint does not cross JSON.** `JSON.stringify` throws on a `BigInt`, and
  `z.bigint()` rejects a JSON number, so zod-openapi's `integer`/`int64` is not
  what travels. The endpoint says what does with `.meta({ type })`.
  zod-openapi writes `integer`/`int64` over that `type`, so the override puts
  it back.
- **Two visits per `.meta()`.** zod visits a schema carrying `.meta()` twice at
  the same path, first without the meta and then with it. So the bigint check
  is deferred: a visit without a `type` notes its path, a later visit at that
  path with one clears it, and `toJsonSchema` throws after `createSchema`
  returns if any path is left. The error names the path (`properties.b`) and
  what to do (`give it .meta({ type })`); zod-openapi's wrapper segments are
  left out of it.
- `endpoint()` converts its schemas when it is defined, as today, so every
  error surfaces at startup.

`io` is `'input'` for `input` and `params`, `'output'` for every `output`
status: a field with a default may be left out of a request and is always
present in a response.

`createSchema` returns a schema and its `components`: the shared schemas
(`.meta({ id })`), referenced as `#/components/schemas/<id>`. Each consumer
places them: the document as `components.schemas`, the adapter as named AST
schemas, `schemas.ts` inlined.

zod-openapi's own `.meta()` keys (`override`, `unionOneOf`, `outputId`) keep
working in both the document and the SDK. Its `discriminator` block is OpenAPI
vocabulary: the adapter ignores the keyword, and the union it decorates
converts as usual.

Rejected: our own converter on `z.toJSONSchema` (its `unrepresentable` handler
and `override` hook). It is not tied to OpenAPI, but it re-implements what
zod-openapi handles already, and it stops users' zod-openapi `.meta()` keys
from working.

### Endpoint descriptors

An endpoint's `setupFn` (`endpoint-fn.ts`) already computes everything the SDK
needs: it applies the swagger decorators from it. It also stores one
`EndpointDescriptor` on the endpoint class as metadata
(`endpoints:descriptor`), beside the `endpoints:path` it stores today:

| Field | From |
| --- | --- |
| `operationId` | `httpPathPascalName` |
| `method` | the endpoint's HTTP method |
| `path` | `httpPath` in `{param}` notation (`/recipes/{recipeId}/view`) |
| `pathParams` | the `:name` segments of `httpPath`, in order |
| `namespaceChain` | the router chain |
| `tags`, `summary` | as given to `ApiOperation` |
| `input`, `params` | the zod schema, unwrapped from `SchemaDef`, and its `toJsonSchema(…, 'input')` result |
| `outputs` | status → zod schema, description, and its `toJsonSchema(…, 'output')` result |

The JSON Schemas are the results of the same `toJsonSchema` calls the swagger
decorators are built from, so the document, the AST and `schemas.ts` read one
conversion per schema.

`setupCodegen(app, …)` collects the descriptors from the controllers of `app`'s
modules (`ModulesContainer`), the set `SwaggerModule.createDocument(app)` walks.
A global registry would not do: one process can create several apps (the e2e
suites do), each mounting a different set of endpoints, and an endpoint class
mounted by a router module is set up again for each mount.

Only `endpoint()`s are described. A plain Nest `@Controller` has no descriptor;
it stays in the OpenAPI document and is not in the SDK.

### The descriptor → AST mapping

For each descriptor the adapter emits one `HttpOperationNode`:

- **Path parameters.** One `ParameterNode` (`in: 'path'`, required) per
  `pathParams` entry. Its schema is the matching property of `params`, or a
  string when `params` is absent or does not declare it.
- **GET input.** One `ParameterNode` (`in: 'query'`) per property of the
  converted `input` schema, required when the property is in `required`. The
  converted schema must be an object; anything else throws.
- **Mutation input.** A `RequestBodyNode` with one `application/json` content
  entry referencing the named schema `<operationId>Input`.
- **Outputs.** One `ResponseNode` per status, its content referencing the named
  schema `<operationId>Output` for `200` and `<operationId><status>Output`
  otherwise.
- **Named schemas.** The `Input` and `Output` schemas above, and every shared
  schema (below), are entries of `InputNode.schemas`, referenced with
  `RefSchemaNode`. The generated type names
  are therefore the ones the client has today (`UserCreateInput`,
  `UserCreate400Output`, `GreetQueryParams` from Kubb's query-parameter type).

The JSON Schema the adapter accepts is what zod emits:

- `type`, including a type array (`["string", "null"]` → nullable);
- `properties`, `required`, `additionalProperties`, `propertyNames`;
- `items`, `prefixItems`;
- `anyOf`, `oneOf`, `allOf`;
- `enum`, `const`;
- `not: {}` (never) and `{}` (unknown);
- `format`, `pattern`, length, size and numeric bounds;
- `default`, `description`, `examples`, `deprecated`, `readOnly`;
- `discriminator`, which is ignored;
- local `$ref`s into `#/components/schemas/`.

Any other keyword throws, naming the operation and the JSON pointer of the
schema. Nothing becomes `unknown` silently.

### Shared schemas (`.meta({ id })`)

One id can convert differently by direction: a field with a default is optional
in the input conversion and required in the output one. Kubb's AST and the
document each hold one schema per name, and `createSchema` names both
conversions `<id>` (it renames an output copy only inside its own
`createDocument`). So the `components` of every endpoint's conversions are
merged across the app, before any client is filtered:

- An id whose conversions are all equal is one schema, named `<id>`.
- An id whose input and output conversions differ is two: `<id>` for input and
  `<id>Output` for output. `$ref`s in output conversions are rewritten to
  match.
- The two directions are compared without `additionalProperties: false`. zod
  closes every object it converts for output and never one for input (unless
  it is `.strict()`), so without this nearly every shared object would get a
  twin whose TypeScript type is identical to the original. When that keyword is
  the only difference, the id is one schema, its input conversion. That holds
  for both directions: a request may carry extra keys (the server strips them)
  and a response carries none, which an open schema allows. The document loses
  only the mark that such a shared response object is closed; inline response
  objects keep it.
- An id that names two different schemas in the same direction throws, naming
  the id and two endpoints that use it.

The document and the SDK both use the merged set, so a shared schema has the
same name in both. (The document today merges each conversion's components
into one object, last write wins, so an id used in both directions describes
only one of them.)

### The OpenAPI document

`setupOpenAPI` and `setupCodegen`'s `openapi` option keep building the document
through `@nestjs/swagger`, from the decorators `setupFn` applies.
`zodToOpenApi`, `ApiQueries` and `ApiParams` convert through `toJsonSchema`, so
the document carries the same date, bigint and union rules as the SDK.
`ApiQueries` and `ApiParams` convert the whole object once and split its
`properties` (and `required`) into parameters, not each field on its own, so a
GET's query parameters in the document and in the AST come from the same
conversion.

Which ids need an `Output` twin is only known once every endpoint of the app is
seen, so `setupOpenAPI` settles them after `SwaggerModule.createDocument(app)`:
it collects the app's descriptors (as `setupCodegen` does), merges their shared
schemas, sets them as `components.schemas`, and rewrites the `$ref`s to renamed
ids in the response schemas of the app's endpoint operations.
`zodToOpenApi` no longer writes components into the global
`settings.openapi.components.schemas`.

`setupCodegen` builds, writes and serves the document only when its `openapi`
option is given. Without it, nothing is written: today it writes
`__generated-openapi.json` beside the package's own files when
`openapi.outputFile` is absent.

### Buckets, namespaces and hook binding

The wrapper's namespace buckets come from the descriptors' `namespaceChain`,
and a client's `namespaces` filter keeps the descriptors whose top-level segment
is listed. `filter-doc.ts`, `document.ts` and the document walk in `buckets.ts`
are removed.

`bindHook`'s options index comes from the descriptor: 1 for a query operation
with path parameters or input, else 0, the same rule the wrapper reads from the
document today.

### `schemas.input`

`schemas.ts` holds, for each operation with input, the converted `input` schema
with its `$ref`s resolved: the same object the adapter built the operation's
body or query type from. For a GET that is the whole object schema as
`createSchema` returns it. The reassembly from query parameters it replaces
emits only `type`, `properties` and `required`, so object-level keywords such
as `additionalProperties` and the object's `description` were dropped. `InputSchema<T>` and its `'~type'` property are unchanged.

### Change detection

Regeneration is keyed to the OpenAPI document's `changed` flag today. It moves
to a hash per client of:

- the client's filtered descriptors, with their converted JSON Schemas;
- the client's config (`type`, `namespaces`, `options`);
- the nestjs-endpoints version.

The hash is written into the generated wrapper's header comment
(`// nestjs-endpoints: <sha256>`). A missing wrapper, a missing output
directory, or a different hash regenerates that client; `forceGenerate` still
regenerates every client. A change to a client's `options` now regenerates it.

### Dependencies

- `zod-openapi` stays, and the `zod` peer range is unchanged.
- `@kubb/adapter-oas` is removed and `@kubb/ast` is added, pinned to an exact
  version like the other Kubb packages, with its entry in
  `minimumReleaseAgeExclude` (root and example workspace).

## Testing

Unit (`packages/nestjs-endpoints/src/`):

- `zod-to-openapi.spec.ts`, for `toJsonSchema`: each row of the overrides
  table, in both directions; a nullable date; a bigint with `.meta({ type })`
  keeps that type, one without throws with its path (no zod-openapi wrapper
  segments); an input date schema, through `z.fromJSONSchema`, accepts
  `2024-01-01` and `2024-01-01T10:00:00Z`; `.meta({ id })` lands in
  `components`; zod-openapi's own `.meta({ override })` still applies.
- A shared-schema spec: equal conversions give one name, input/output
  differences give `<id>` and `<id>Output` with output refs rewritten, a
  difference in `additionalProperties: false` alone gives one name (the input
  conversion), two schemas with one id in one direction throw.
- `zod-to-openapi.spec.ts` and `helpers.spec.ts` keep their existing cases.

Unit (`packages/nestjs-endpoints/src/codegen/kubb/`):

- `adapter.spec.ts`: each accepted JSON Schema construct → its AST node,
  including type arrays, `prefixItems`, records, `.meta({ id })` refs; an
  unsupported keyword throws with the operation and pointer.
- `descriptors.spec.ts`: path parameter names from `httpPath`; GET input as
  query parameters, mutation input as body; per-status outputs; namespace
  filtering; two apps in one process each collect only their own endpoints.
- A change-detection spec: the hash is stable across runs and changes with a
  schema, the client config, or the version.
- `input-schemas.spec.ts` and the document-reading cases of `buckets.spec.ts`
  are retired; their cases move to the descriptor tests.

End to end (written in `test-app-express`, copied to `test-app-fastify` by
`scripts/test.sh`):

- `client.e2e-spec.ts`, `namespace-codegen.e2e-spec.ts`,
  `path-params.e2e-spec.ts` and the react-query `test/*.spec.tsx` are the
  regression gate. They pass unchanged, except that `vanillaController*` leaves
  the generated client.
- A new `codegen-types.e2e-spec.ts`: `expectTypeOf` asserts that each generated
  body or query type equals `z.input<typeof input>`, each path type equals
  `z.input<typeof params>`, and each response type equals `z.output<…>` of its
  status's schema, over the test app's endpoints.
- `schemas.input` deep-equals `toJsonSchema(input, 'input')` with refs
  resolved, for every operation with input.
- `zod-openapi.e2e-spec.ts` keeps its cases; a new case uses one `.meta({ id })` with a
  defaulted field in an input and an output and asserts `<id>` and
  `<id>Output` in `components.schemas`.
- `setupCodegen` without `openapi` writes no document file.

## Docs

In the same change, describing the current behaviour only:

- README, Codegen: the SDK is generated from the endpoints' zod schemas; the
  OpenAPI document is for the docs UI and other generators; plain controllers
  are not in the SDK.
- README and agent guide: how dates convert (ISO date-time or date in, ISO
  date-time out) and that a bigint needs `.meta({ type })`, next to the
  existing transform guidance.
- Agent guide (`packages/nestjs-endpoints/docs/agents.md`): §6 OpenAPI, §8
  Codegen, §9.2 and its `schemas.input` paragraph, §2.4 (`headers`).
- The skill's `description`, if it names the source of the SDK.
- `CHANGELOG.md` breaking entries: plain controllers are no longer in the
  generated clients; a bigint needs `.meta({ type })`; `setupCodegen` writes
  the OpenAPI document only when `openapi` is given. A fix entry: a shared
  schema used in both directions gets its `Output` twin in the document.

## Consumer impact

- Routes from plain Nest controllers leave the generated clients.
- `headers` is `?: never` on every operation: nothing declares header
  parameters for the SDK.
- `schemas.input` for a GET keeps its object-level keywords
  (`additionalProperties`, `description`).
- An input date's schema is a `oneOf` of ISO date-time and ISO date, and an
  output date's says `format: 'date-time'`, in both the SDK and the document.
  The TS type of both stays `string`.
- An endpoint schema with a bare `z.bigint()` throws at startup until it gets
  `.meta({ type })`.
- `setupCodegen` without `openapi` writes no OpenAPI document.
- A shared schema used in both directions with different shapes appears as
  `<id>` and `<id>Output`; one that differs only in being closed for output
  is one schema, `<id>`, without `additionalProperties: false`.
- Everything else (call shape, names, `setupCodegen` options) is unchanged; a
  consuming app regenerates and builds.
