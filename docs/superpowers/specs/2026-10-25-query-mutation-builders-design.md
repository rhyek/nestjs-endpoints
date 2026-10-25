# Query and mutation builders — design

## Goal

An endpoint says whether it is a query or a mutation, and that alone decides
what the generated react-query client gives it. The HTTP method stops carrying
that meaning: every endpoint is a `POST` whose `input` is the JSON body.

## API

- `endpoint()` is removed. `endpoint` is an object with two builders,
  `endpoint.query({...})` and `endpoint.mutation({...})`. They take the same
  options and return the same kind of controller class; the only difference is
  the `kind` recorded on the endpoint's descriptor.
- `method` is optional, default `'post'`, and accepts
  `'get' | 'post' | 'put' | 'delete' | 'patch'`. It exists for callers other
  than the generated client (an OAuth callback, a download link).
- `input` is always read with `Body()`. A request without a body is parsed as
  `{}` unless the schema accepts a missing body as it is (Fastify answers 400,
  before the handler, to an empty body sent as `application/json`). With
  `method: 'get'` it is a type error (`input?: never`) and the builder throws
  when called, naming the file.
- `query` is a new option: a zod object schema read with `Query()`, allowed on
  any method. It is converted like the old GET input (`convertObject`, one
  `ApiQuery` per property), so nested-object search params behave as before. A
  non-object schema throws, naming the endpoint. The handler receives `query`
  and `schemas.query`; `invoke(rawInput?, { params?, query? })`.
- Every endpoint answers 200 unless the handler returns another status (the
  handler sets the status itself). `HttpCode(200)` keeps the OpenAPI
  document's default response in agreement, which a `POST` without `output`
  would otherwise get as 201.
- The OpenAPI document shows each endpoint's real method, `input` as the
  request body, `query` as query parameters, `params` as path parameters, and
  an `x-endpoint-kind` extension (`query` or `mutation`) on every operation,
  for generators run against the document rather than `setupCodegen`.

## Codegen

- `EndpointDescriptor` gains `kind`; `query` becomes the query object's
  conversion (`json`, `components`, `parameters`); `input` is only the body.
  `query` components are gathered with the input-direction shared schemas.
- The adapter takes query parameters from `query` and a body from `input` on
  any method.
- `@kubb/plugin-react-query` classifies operations by HTTP method only.
  `kindOverrides` prepends one `override` per operation (matched by literal
  `operationId`) carrying the user's first matching override's options, with
  `query` and `mutation` replaced so the operation's method is claimed by its
  builder's kind alone (`methods: [METHOD]` for its kind, `[]` for the other).
  Override options are not merged over the plugin's defaults, so each carries
  `importPath`. The user's own overrides follow. A `query: false` or
  `mutation: false`, top level or in the user's matching override, still turns
  the kind off; `include` / `exclude` still apply first. `query.methods` and
  `mutation.methods` are therefore ignored.
- `operationKinds` mirrors that resolution so the wrapper refers only to
  helpers Kubb generated.
- `schemas.ts` exports, per operation, `{ input?, query? }`: `input` typed
  from the client's `body` group, `query` from its `query` group (present only
  when `query` has properties). The wrapper exposes it as `api.x.schemas`.
- The SDK call shape stays `{ path, query, body }`.

## Testing

- Unit: descriptors (default POST, kind, `query` split, `query` + `input`,
  GET + `input` throws), operation kinds and overrides, input schemas, buckets,
  wrapper, adapter, hash (changes with kind).
- e2e (test-app-express, mirrored): GET + `query` endpoint with coercion and
  400s, POST with `query` and `input`, the type error and the runtime throw,
  axios client calls; react-query: a POST `endpoint.query()` gets query hooks,
  `schemas.query` exists.
