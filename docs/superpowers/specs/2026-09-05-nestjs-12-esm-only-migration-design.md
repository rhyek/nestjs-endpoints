# NestJS 12 + ESM-only migration

**Date:** 2026-09-05
**Status:** Implemented
**Scope:** `packages/nestjs-endpoints` (the only deployable), all test projects,
`examples/file-based-routing`, build/test scripts, docs. Breaking change for
consumers.

## Goal

Drop support for NestJS < 12 and for CommonJS entirely. The library becomes
**ESM-only, NestJS >= 12 only, Node >= 24 only, TypeScript >= 6 only**, and
every dependency moves to current. Every feature, hack, and test that exists
solely to serve CJS or an older NestJS is removed, and every `tsconfig.json` in
the repo — library, test projects and example alike — is made valid under
TypeScript 7.

## Why

NestJS 12 ships all core packages as ESM and raises its own floor to Node
20.19+ / 22.12+. Supporting CJS alongside it costs this repo:

- A **dual build** (`tsconfig.cjs.json` + `tsconfig.esm.json`) producing two
  output trees plus two synthetic `package.json` files.
- **Six `sed` invocations** in `scripts/build.sh` that rewrite emitted
  JavaScript after the fact — the `require(f).default` →
  `await import(f)` swap in `endpoint-router.module.js`, and `__dirname` →
  `import.meta.dirname` in three files. Source code carries eslint-disable
  comments explaining the rewrite, so the hack has leaked into the source.
- **Runtime version sniffing**: `getMiddlewareWildcardSegment` uses
  `createRequire` to read `@nestjs/core/package.json` and pick `*` vs
  `{*path}`, purely to keep NestJS 10 working.
- **Four test apps** (express/fastify × cjs/esm) where two exist only to prove
  the CJS half works.

Removing CJS deletes all of it rather than maintaining it.

## Non-goals

These were evaluated and explicitly excluded. See "Rejected: NestJS 12
standard-schema validation" below for the evidence.

- Adopting `StandardSchemaValidationPipe` or `StandardSchemaSerializerInterceptor`.
- Replacing `zod-openapi` with `@nestjs/swagger` 12's `standardSchemaConverter`.
- Any change to the public API of `endpoint`, `setupCodegen`, or `setupOpenAPI`
  beyond the peer-dependency floor.

## Rejected: NestJS 12 standard-schema validation

NestJS 12 added `@Body({ schema })` / `@Query({ schema })` / `@Param({ schema })`
backed by `StandardSchemaValidationPipe`, and `@SerializeOptions({ schema })`
backed by `StandardSchemaSerializerInterceptor`. Adopting them was considered
and rejected on evidence read from the installed v12.0.1 sources.

**The serializer cannot express this library's output contract.** From
`@nestjs/common/serializer/standard-schema-serializer.interceptor.js`:

1. `serialize()` returns early when `!isObject(response)`. Scalar outputs are
   **silently** never validated or transformed — `greet.endpoint.ts` (`z.string()`),
   `complex-get.endpoint.ts` and `count.endpoint.ts` (`z.number()`) would lose
   output validation with no error to signal it.
2. For an array response it maps `transformToPlain` over **each item** using the
   whole schema, so the seven `output: z.array(...)` endpoints would validate
   each element against the array schema and throw.
3. It resolves one schema per handler via `@SerializeOptions`, with no status
   awareness. Per-status maps (`output: { 201: ... }`) have no representation,
   and the library's `EndpointResponse` wrapper would be validated in place of
   its `.body`.

These are structural properties of the class, not configuration.

**The validation pipe is feasible but nets more code.** `invoke()` calls
`commonHandlerLogic` directly, outside Nest's pipe chain. Moving input
validation into the pipe means either `invoke()` loses validation or the
existing `safeParse` path stays for it — two validation paths for one schema.
Since the code must remain either way, adopting the pipe adds a path rather
than removing one.

Zod 4's `~standard.validate` does return genuine `ZodIssue`-shaped objects and
does strip unknown keys, so error-shape fidelity was *not* the blocker; feature
loss was.

**Noted for a future spec, deliberately out of scope:** `@nestjs/swagger` 12
ships `StandardSchemaOpenApiConverter` and a pluggable `standardSchemaConverter`
option, and zod 4 exposes `~standard.jsonSchema`. That is a credible path to
retiring `zod-openapi` and the manual `ApiBody`/`ApiParams` wiring, but it is an
OpenAPI-generation change, independent of this migration.

## Constraints — what must NOT change

- Every existing test must pass. The suite is the gate.
- Input/output **type inference** in `endpoint({ input, output, handler })` is
  unchanged; it is a compile-time concern and this migration does not touch it.
- Output validation continues to **strip** keys absent from the schema, and to
  apply zod `.transform()` (e.g. `z.date().transform(d => d.toISOString())`).
- Per-status `output` maps and `EndpointResponse` keep working.
- `ZodValidationException` / `ZodSerializationException` keep their current
  shape. (Changes here are permitted if they improve correctness without losing
  a feature, but none are planned.)

## Architecture

### Library packaging

`package.json`:
- `"type": "module"`.
- Drop `main`. `exports` collapses to a single ESM entry:
  `{ ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } }`.
- `peerDependencies`: `@nestjs/common`, `@nestjs/core`, `@nestjs/swagger` all
  `>=12.0.0`; `zod >=4.1.0` unchanged.
- Add `"engines": { "node": ">=24" }`. This is a deliberate product decision,
  not a derived minimum: the floor forced by dependencies is lower (NestJS 12
  requires 20.19+ or 22.12+; `@kubb/core` 5 declares `engines.node >= 22`), but
  the library supports Node 24+ only. Node 24 is the active LTS line and is
  already what `.tool-versions` pins.

tsconfigs: `tsconfig.build.json`, `tsconfig.cjs.json` and `tsconfig.esm.json`
collapse into one build config with `module: nodenext`,
`moduleResolution: nodenext`, `outDir: ./dist`. `tsc-alias` is no longer needed
and its devDependency is removed.

### Source changes

| File | Change |
|---|---|
| `endpoint-router.module.ts` | Delete `getMiddlewareWildcardSegment` and its `createRequire`; hardcode `{*path}`. Gate: `no-legacy-route-warnings.e2e-spec.ts` exists precisely to assert the wildcard emits no deprecation warning. Replace both `require(f).default` with `await import(pathToFileURL(f).href).then(m => m.default)` — the URL form, because bare absolute paths break ESM import on Windows. Remove the eslint-disable comments that documented the sed rewrite. |
| `setup-openapi.ts` | `createRequire(path.join(__dirname, 'package.json'))` → `createRequire(import.meta.url)` in `findScalarBundle`. |
| `codegen/setup.ts` | `path.resolve(__dirname, ...)` → `import.meta.dirname` (needs Node >= 20.11; the `engines` floor of 24 covers it comfortably). |
| `consts.ts` | Drop `cjs` from `endpointFileRegex` and `routerModuleFileRegex`. |
| `helpers.ts` | **Fix a latent bug.** `getCallsiteFile` strips the prefix with `.replace(/^file:\/\//, '')`. Under CJS that was a no-op; ESM-only makes it the sole path, and it is wrong twice: URL escapes survive (`/url%20test/probe.mjs` for a path containing a space) and Windows URLs decode to `/C:/foo`. Replace with `fileURLToPath(url)` when the callsite starts with `file:`. Same reasoning as `pathToFileURL` on the import side. |

### Build script

`scripts/build.sh` collapses to a single `tsc --project tsconfig.build.json`.
All six `sed` invocations and both `echo '{"type": ...}' > dist/*/package.json`
lines are deleted.

### Test project consolidation

**This is the step where care is required: `test-app-express-cjs` is the source
of truth for the entire test corpus.** It holds 86 committed files (67 under
`src/`, 13 under `test/`). The other three apps commit only 7–8 config files
each and `.gitignore` their own `src/*`; `scripts/test.sh` rsyncs sources into
them at test time. Deleting a directory because its name ends in `-cjs` would
destroy every endpoint fixture and spec file in the repo.

Final layout is three projects:

| Action | Result |
|---|---|
| `git mv test-app-express-cjs test-app-express`, then convert to ESM | Canonical app; all 86 files keep their history. This is where tests continue to be written. |
| Delete `test-app-express-esm` **after** using its `package.json` / `tsconfig.json` as the ESM conversion reference | Its `create-app.ts` is byte-identical to the express-cjs one; nothing is lost. |
| `git mv test-app-fastify-esm test-app-fastify` | Already ESM-configured. Carry over the `build` / `start` scripts that only `test-app-fastify-cjs` has. |
| Delete `test-app-fastify-cjs` | Its `create-app.ts` is byte-identical to the fastify-esm one. |
| `test-react-query-client` | Unchanged apart from dependency bumps. |

`create-app.ts` differs **per adapter** (express sets `query parser`; fastify
constructs a `FastifyAdapter` with a `qs` querystring parser), which is why
`test.sh` rsyncs with `--exclude=create-app.ts` and copies it separately. With
one app per adapter, both `cp` lines disappear and each app keeps its own
committed `create-app.ts`.

`scripts/test.sh` changes: canonical app renamed; the express→fastify rsync of
`src/` and `test/` is retained; the two `create-app.ts` `cp` lines are removed;
`test_real_run cjs` is removed and `test_real_run esm` becomes a single
un-parameterised run against `test-app-express`.

Also remove the untracked, empty `test-app-express-cjs/packages/…` tree — cruft
from a past bad rsync.

### TypeScript 6 for building, 7-ready by construction

**The repo builds with TypeScript 6 (`^6.0.3`, the latest stable 6.x). It does
not adopt TypeScript 7.** TypeScript 6.0 is the final JavaScript-based release
and exists to flag what the Go-native 7.0 removes; everything 6.0 deprecates,
7.0 deletes.

The two halves of this are separate decisions and both are deliberate:

- **Build on 6.** The compiler in `devDependencies` is `typescript@^6.0.3`
  everywhere — library, test projects and example.
- **Stay clean on 7.** No config uses an option 7.0 removes, and
  `ignoreDeprecations` is never used. Deprecated options are deleted rather
  than silenced, so adopting 7 later is a version bump with no config work.

The post-migration config shape was built end-to-end on `tsc` 6.0.3 and
compiles clean, emitting real ESM: `module`/`moduleResolution: nodenext`,
`target: esnext`, `experimentalDecorators`, `emitDecoratorMetadata`,
`types: ["node"]`, with `import.meta.dirname` and `fileURLToPath` in the source.

**`"type": "module"` and `nodenext` are coupled and must land together.**
`nodenext` derives each file's module format from the nearest `package.json`
`type` field. With the field absent, the same config fails with
`error TS1470: The 'import.meta' meta-property is not allowed in files which
will build into CommonJS output.` The packaging change is therefore a
prerequisite of the source change, not merely adjacent to it.

Verified empirically against `tsc` 7.0.2 rather than assumed:

- `baseUrl` is **removed**, not merely deprecated: `error TS5102: Option
  'baseUrl' has been removed.`
- `experimentalDecorators`, `emitDecoratorMetadata`, `jsx` and `esModuleInterop`
  all compile clean. The Go port implements the decorator flags, so NestJS's
  decorator model is unaffected — the eventual move to 7 carries no decorator
  risk, which is the point of keeping the configs clean now.

**`baseUrl: "./"` appears in four test-app tsconfigs and is the repo's only
hard TS 7 blocker.** No `tsconfig.json` anywhere in the repo defines `paths`,
so `baseUrl` is doing nothing at all — it is residue from before TS 4.1 made it
optional. It is deleted outright; no `paths` rewrite is required.

A full sweep for the rest of the 6.0 deprecation list found the repo already
clean: no `moduleResolution: node`/`classic`, no `module: amd`/`umd`/`system`/
`none`, no `outFile`, no `target: es5`, no `downlevelIteration`, and no
`esModuleInterop: false` / `allowSyntheticDefaultImports: false` /
`alwaysStrict: false`.

Two changed 6.0 *defaults* need attention even though no option is deprecated:

- **`types` now defaults to `[]`** instead of auto-including every
  `node_modules/@types` package. Most configs already set `types` explicitly,
  but the library's own is `["vitest/globals"]` with no `"node"` — it currently
  gets Node globals only transitively. Since the ESM work introduces
  `import.meta.dirname`, `"node"` is added explicitly rather than left to luck.
- **`noUncheckedSideEffectImports` now defaults to `true`**, which can surface
  new errors on side-effect-only imports.

Every `tsconfig.json` is updated, including `examples/file-based-routing`'s two
and `test-react-query-client`'s.

### Dependencies

Library: `@kubb/*` 4.38.0 → 4.39.3 (see Implementation notes — 5.x is not adoptable), `zod-openapi` 5.4 → 6.x, `callsites` 3 → 4
(ESM-only, now unblocked), `openapi-types`, `vitest`, and `typescript` 5.7 →
`^6.0.3` — **not** 7.x. Peers as above. `typescript` stays a devDependency — it
is not added as a peer — but README states the >= 6 floor, and the configs are
written to be valid on 6 and 7 alike.

Test apps and example: `@nestjs/*` → ^12, plus `@tanstack/react-query`,
`axios`, `vite`, `vitest`, `@types/*`. `nest upgrade` is used for the app-side
v11→v12 mechanics in the test apps and the example, but **not** on the library.

Two transitive constraints, already checked, that make some bumps non-optional:

- `vitest` 5 peers `vite ^6.4.0 || ^7 || ^8` and `@types/node ^22 || >=24`.
  `test-react-query-client` pins `vite ^6.2.5` and the test apps pin
  `@types/node ^20.3.1`; both must move or vitest 5 is not installable.
- `zod-openapi` 6 peers `zod ^4.0.0` — satisfied by the existing `>=4.1.0`
  floor, which stays as is.

`.tool-versions` already pins Node 24.14.0, so CI and local development already
sit on the supported floor and need no change.

### Docs

- `README.md`: Requirements becomes Node >= 24, NestJS >= 12, TypeScript >= 6,
  Zod >= 4.1 (currently claims Node >= 20); the "Adapter-agnostic" bullet drops
  "CommonJS or ESM"; the install snippet is unchanged.
- `CLAUDE.md`: five test projects → three; canonical app renamed to
  `test-app-express`.
- `CHANGELOG.md`: one entry flagged `_(Breaking: …)_`.

## Rollout sequencing

Executed in three phases for debuggability, then **squashed into a single
commit** — three majors land here and each can break the suite independently,
so a red suite must be able to name its own cause.

1. **NestJS 12 only.** Bump `@nestjs/*` to ^12 everywhere — including
   `@nestjs/cli` and `@nestjs/testing`, which the CJS apps need for
   `nest build` / `nest start` — and leave packaging and all other
   dependencies alone. Expected outcome is a green four-app suite **or** a
   failure that is specifically `require(esm)`-related in the two CJS apps. The
   latter is not a NestJS 12 lifecycle break and must not be read as one; if it
   happens, phases 1 and 2 merge and the CJS apps are removed rather than
   repaired.
2. **CJS removal.** Library packaging, source changes, build script, test
   project consolidation.
3. **Remaining dependencies + the tsconfig sweep.** Kubb 5, TypeScript 6.0.3,
   zod-openapi 6, vitest 5, scalar, react-query — and every `tsconfig.json`
   made TS 7-clean in the same phase, since `baseUrl` removal and the TS 6
   default changes are only observable once the compiler itself moves.
   `pnpm -r run tscheck` is the gate. Cleanliness on 7 is confirmed by running
   `tsc` 7 once as a check; 7 is not installed as a dependency.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| **NestJS 12 changes lifecycle hooks to be invoked by hierarchy level.** This library depends on module-load-time side effects: `settings.endpoints` is populated at import, `setupFn` ordering matters across nested router modules, and tags are mutated during `_register`. Most likely phase-1 breakage. | Isolated in phase 1, before anything else moves. |
| **Kubb 4 → 5 is a major on the codegen**, which is the library's core output, and the generated react-query client is committed to the repo. | Isolated in phase 3; the generated diff is read, not rubber-stamped. `test-react-query-client` and `namespace-codegen.e2e-spec.ts` are the gate. |
| ~~TypeScript 7 may not support `experimentalDecorators` / `emitDecoratorMetadata`.~~ **Retired.** | Disproved against `tsc` 7.0.2: both flags compile clean. No fallback needed. |
| TS 6.0's changed defaults (`types: []`, `noUncheckedSideEffectImports: true`) surface errors unrelated to any deprecated option. | Caught by `pnpm -r run tscheck`, which already runs across every package in `test.sh`. |
| Consumers on CJS, NestJS < 12, or Node < 24 are cut off. | Intended. Flagged as breaking in the changelog; the peer range and `engines` enforce it at install time. |
| `await import()` of endpoint files changes module-resolution failure modes vs `require`. | Covered by the file-based-routing e2e specs across both adapters. |

## Implementation notes

### Phase 1 — what NestJS 12 actually broke

Neither predicted failure occurred: lifecycle-hook ordering caused nothing, and
`require(esm)` loaded ESM NestJS into the CJS apps without complaint. Two
unpredicted things broke instead.

**1. Duplicate `@nestjs/core`, from an undeclared `rxjs`.** 52 of 55 e2e tests
failed with `Nest can't resolve dependencies of the AuthLoginEndpoint …
"Symbol(httpAdapterHost)"`. The symbol in that message is only the property
key; the real failure was that `HttpAdapterHost` — a class used as a DI token —
was no longer one object.

The root `package.json` declares `@nestjs/common|core|swagger` so the library
can compile, but declares no `rxjs`. The compiled library resolves
`@nestjs/core` from the root `node_modules`, each test app resolves its own, and
pnpm keys a package's physical instance on its resolved peers. Under NestJS 11
both sides happened to land on `rxjs@7.8.1`; re-resolving for 12 gave the root
`7.8.2` while the apps stayed pinned at `7.8.1`, producing two `@nestjs/core`
copies and two distinct `HttpAdapterHost` classes.

This was pre-existing fragility that the bump merely exposed — the root's peer
set matched the apps' only by accident. Fixed by aligning every importer on one
`rxjs` and encoding the invariant as a `pnpm.overrides` pin, so a future bump
cannot silently re-split it. Note this is a workspace artifact only: a consumer
installing the published package has a single `@nestjs/core` and was never
affected.

**2. The middleware wildcard sniff was silently broken.** NestJS 12's
`@nestjs/core` is ESM with an `exports` map of `{".": …, "./*": "./*.js"}`, so
`require('@nestjs/core/package.json')` resolves to `package.json.js` and throws
`MODULE_NOT_FOUND`. `getMiddlewareWildcardSegment`'s `try/catch` swallowed that
and fell back to the legacy `*`, emitting the exact `LegacyRouteConverter`
deprecation warnings the function existed to prevent.

The planned removal of that function (hardcoding `{*path}`) is therefore a bug
fix under NestJS 12, not just cleanup, and was pulled forward into phase 1.

**3. The guard test for it was vacuous.** `no-legacy-route-warnings.e2e-spec.ts`
asserted by wrapping `process.stdout/stderr.write` around app boot — but
`Test.createTestingModule()` suppresses the logger's *output*, so nothing was
ever captured (measured: zero writes during boot) and the test passed whether or
not the bug existed. It now spies on `Logger.prototype.warn`, which is still
invoked under the testing module and is public API. Rewritten first, confirmed
failing against the real bug, then fixed.

### Phase 3 — what the dependency bumps actually broke

**1. Kubb 5 is not adoptable; the set stays on 4.39.3.** The spec originally
planned `@kubb/core` 5.x. Only `core`, `plugin-react-query` and `plugin-ts`
have stable 5.x releases — `@kubb/plugin-client` and `@kubb/plugin-oas` are
still `4.39.3` on `latest`, with 5.x existing only as alpha/beta. Adopting
core@5 would mean running a mixed-major plugin set. All five packages move to
the latest stable 4.x instead. This also makes Kubb's `engines.node >= 22`
moot.

**2. `zod-openapi` 6 fixed an inconsistency the fixtures encoded.** A field
declared `z.object({...}).nullish().default(null)` was emitted as `required`
when wrapped in `z.preprocess(...)` and not required otherwise. v6 makes both
cases agree on "not required", which is correct for an input schema — a field
with a default may be omitted. The expectation for that case was updated.

**3. vitest 5 defaults `clearMocks` to `true`, which is incompatible with
`concurrent` spy assertions.** Five e2e tests began failing their
`toHaveBeenCalledTimes` assertions while their HTTP assertions still passed —
the filters were firing, but the recorded history was gone. `clearMocks: true`
runs `vi.clearAllMocks()` **before every test**, so in a `concurrent` suite a
starting test wipes the spies of tests still in flight.

The fix is `clearMocks: false` in each app's vitest config, **not** serialising
the suite. Serialising would have masked the cause and silently dropped the
concurrency the suite was written for. This was mis-diagnosed three times
first — as a NestJS 12 filter-matching change, as shared controller classes
across concurrently booted apps, and as `BaseExceptionFilter` state — before a
minimal repro containing no library code reproduced it, which ruled the library
out, and the vitest 5 changelog named the cause.

**4. TypeScript 6 turned the `rootDir` default change into a hard error.** The
test apps' `tsconfig.build.json` had no `rootDir`, and 6.0 reports
`error TS5011: The common source directory ... must be explicitly set`.
Both now set `"rootDir": "./src"` explicitly.

Also fixed along the way: the test apps' `vitest.config.ts` used `__dirname`,
which does not exist once the packages are `type: module`, and
`@testing-library/jest-dom`'s generic entry no longer augments vitest's
`Assertion` types — the setup file must import `@testing-library/jest-dom/vitest`.

### Verification

`tsc` 7.0.2 was run against every real config, not just a synthetic probe.
All four workspace configs are **TS 7-clean**. One TS 7-only *type inference*
difference remains, in `helpers.spec.ts`: zod's `ZodPreprocess` no longer
satisfies the `ApiQueries` generic constraint. That is a type-level
incompatibility rather than a config problem — nothing 7.0 removed is still in
use — and it does not affect the TS 6 build. Worth resolving before adopting 7.

The example's client was regenerated by actually booting the API; Kubb
4.38.0 → 4.39.3 produces byte-identical output.

### Two things the test suite could not have caught

**The example's `main.ts` used `__dirname`.** Making that package
`"type": "module"` broke its bootstrap with `ReferenceError: __dirname is not
defined`. The example's tests never boot `main.ts`, so nothing failed — it was
found only by running the app. Fixed with `import.meta.dirname`.

**`pnpm-workspace.yaml` overrides are inert on the pinned pnpm.**
`.tool-versions` pins pnpm 9, but an `overrides:` block in
`pnpm-workspace.yaml` is only read by pnpm >= 10. The repo already had one
(`reflect-metadata: 0.1.14`) that had never taken effect — the committed
lockfile records no `overrides:` at all. Moving the `rxjs` /
`reflect-metadata` pins there would have silently disabled the very guard that
keeps the workspace on one `@nestjs/core`, and reintroduced the
`Symbol(httpAdapterHost)` failure in CI while passing locally. The pins live in
the root `package.json` under `pnpm.overrides`, which pnpm 9 honors; the
lockfile now records them, and `pnpm install --frozen-lockfile` passes.

### Follow-ups closed after the first commit

**`invoke()`'s return type contradicted its runtime.** For an endpoint with a
single `output` schema, `invoke()` returns the parsed body, but the type
claimed an `EndpointResponse` wrapper — so `const { id } = await
create.invoke(...)` in the example did not compile. Pre-existing (TypeScript
5.7 and 6 both flag it) and invisible because the example had no `tscheck`.
`InvokeReturn` now resolves the single-schema form to `z.output<Schema>` and
keeps the response union for the per-status map form, where a handler is
obliged to return a response. The body type also moves from `z.input` to
`z.output`, since what is surfaced is post-`.transform()`. A typed assignment
in `invoke.e2e-spec.ts` gates it — `.resolves.toEqual()` alone would not
have caught the regression.

Both example packages gained a `tscheck` script, and the example root a
`pnpm -r run tscheck`, so this class of drift is visible next time.

**Formatting is uniform under the latest prettier.** The 3.0 → 3.9 bump
changed union-type wrapping. A repo-wide `eslint --fix` confirms every
`.ts`/`.tsx` under `packages/` and `examples/` is clean, so the diff's
formatting churn is consistent rather than partial. `eslint.config.js` now
ignores `**/generated` rather than only `examples/**/generated` — every test
app has codegen output — and its entries pointing at
`packages/test-endpoints-*`, directories that do not exist, were removed.

**A trap worth knowing:** the example depends on the library through
`file:../../../../packages/nestjs-endpoints`, which pnpm materialises as a
*copy*, not a live link. Rebuilding the library does not update it; the
example must be reinstalled or it silently typechecks against a stale build.

## Open questions

None.
