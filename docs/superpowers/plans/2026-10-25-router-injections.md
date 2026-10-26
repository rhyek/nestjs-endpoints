# Router injections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A router module declares `inject` / `injectOnRequest` once and hands out an `endpoint` builder whose endpoints get them, typed.

**Architecture:** `create()` attaches `endpoint` to the `LazyPromise` it returns. That builder merges the router's maps into the endpoint's options and calls the existing `defineEndpoint`, which already wires both maps, so nothing is applied at router load. A router finds its parent's context by its own file instead of by the async-local store at `create()`, and checks at setup that each endpoint it owns was built by its own builder (or the package's).

**Tech Stack:** TypeScript, NestJS 12 (ESM-only), zod, vitest, supertest.

**Spec:** `docs/superpowers/specs/2026-10-25-router-injections-design.md`

> The router options moved under `create({ endpointConfig: { inject, injectOnRequest } })` after this plan was executed; the spec has the final shape.

## Global Constraints

- **Never commit.** Leave every change uncommitted; each task ends by reporting its diff. This overrides the skill's commit steps, and binds subagents.
- Tests are `*.spec.ts` / `*.e2e-spec.ts` and use `test(...)`, never `it(...)`.
- e2e fixtures and specs go in `packages/test/test-app-express` only; `scripts/test.sh` mirrors them to the other apps.
- Neutral fixture names only (workspace, billing, members).
- Comments match the surrounding density and voice of `endpoint-fn.ts` / `endpoint-router.module.ts`.
- After adding or moving fixture files, regenerate the manifest: `cd packages/test/test-app-express && pnpm exec nestjs-endpoints generate`.
- Full gate: `scripts/test.sh` from the repo root (builds, mirrors, codegen, `tscheck`, every e2e suite, the built server). The package must be built (`pnpm --filter nestjs-endpoints build`) before test-app suites see library changes.

## Review Focus

1. **Callsite depth:** an endpoint built with a router's builder must take its path from its own file. Off by one frame, it silently infers from `router.module.ts`. Pinned in Task 2 (`gets its path from its own file`).
2. **Deprecated aliases:** an endpoint using `injectMethod` / `injectAtRequest` under a router with `injectOnRequest` must get both. Pinned in Task 2 (`deprecated injectAtRequest merges with the router's`).
3. **Router without injections:** its `endpoint` must behave exactly like the package's, with no type noise. Pinned in Task 2 (types: `routerWithout.endpoint` handler sees only its own keys).
4. **A collision across maps** (endpoint `inject` key equal to the router's `injectOnRequest` key) is a collision too. Pinned in Task 2.
5. **`params.endpoints` listing:** an endpoint built with router A's builder listed in router B's `endpoints` must fail like a discovered one. Pinned in Task 3.

---

### Task 1: A router finds its parent by its own file

**Files:**
- Modify: `packages/nestjs-endpoints/src/endpoint-router.module.ts` (`createLazily`, `_register`, the nested-router loading loop)
- Test: `packages/test/test-app-express/test/router-load-order.e2e-spec.ts` (create)

**Interfaces:**
- Produces: module-level `const nestedRouterParents = new Map<string, ParentStore>()` keyed by `stripExtension(routerFile)`, where `ParentStore = NonNullable<ReturnType<typeof moduleAls.getStore>>`. A parent sets an entry for every nested router file it discovered before loading it; `_register` uses `nestedRouterParents.get(stripExtension(callsiteFile)) ?? parentStore` (the captured one).

- [ ] **Step 1: Write the failing test**

```ts
// The nested router's module is evaluated first, outside any router, as it
// is when a spec imports one of its endpoints' helpers before the app.
import '../src/shop/category/router.module';
import { Test } from '@nestjs/testing';
import { setupOpenAPI } from 'nestjs-endpoints';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from './create-app';

test('a nested router evaluated before its parent still mounts under it', async () => {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const { app } = await createApp(moduleFixture);
  app.useLogger(false);
  try {
    await request(app.getHttpServer()).post('/shop/category/list').expect(200);
    const { document } = await setupOpenAPI(app, { configure: (b) => b });
    expect(document.paths['/shop/category/list'].post['x-namespace']).toEqual(['shop', 'category']);
  } finally {
    await app.close();
  }
});
```

Match `setupOpenAPI`'s real signature and return shape from `multi-root.e2e-spec.ts`, which already reads the document.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter nestjs-endpoints build && cd packages/test/test-app-express && pnpm test:e2e run test/router-load-order.e2e-spec.ts`
Expected: FAIL. `/shop/category/list` is 404 (mounted at `/category/list`).

- [ ] **Step 3: Implement the lookup**

In `_register`, before `moduleAls.run`, set `nestedRouterParents.set(stripExtension(file), store)` for each file in `nestedRouterModuleFiles`, with `store` the object now passed to `moduleAls.run`. At the top of `_register`, resolve the effective parent store as in Interfaces and use it everywhere `parentStore` is read today. Keep the existing comment's point (deferred work must not read the store of whichever router awaited it), now explaining why it is keyed by file.

- [ ] **Step 4: Run the test, then the package's unit tests**

Run: the Step 2 command, then `pnpm --filter nestjs-endpoints test run`
Expected: PASS, including `a top-level router stays top-level when another router awaits it first`.

- [ ] **Step 5: Report the diff (do not commit)**

---

### Task 2: `inject` / `injectOnRequest` on routers, and the router's `endpoint`

**Files:**
- Modify: `packages/nestjs-endpoints/src/endpoint-fn.ts` (`EndpointOptions`, `EndpointBuilder`, `defineEndpoint`, new `createRouterEndpoint`)
- Modify: `packages/nestjs-endpoints/src/endpoint-router.module.ts` (`create`, `register`, `createLazily`, params type)
- Create fixture: `packages/test/test-app-express/src/workspace/router.module.ts`, `workspace/workspace.service.ts`, `workspace/endpoints/whoami.endpoint.ts`, `workspace/endpoints/members/list.endpoint.ts`, `workspace/endpoints/legacy.endpoint.ts`, `workspace/billing/router.module.ts`, `workspace/billing/billing.service.ts`, `workspace/billing/endpoints/invoice.endpoint.ts`
- Modify: `packages/test/test-app-express/src/app.module.ts` (import `WorkspaceRouterModule`)
- Test: `packages/test/test-app-express/test/router-injections.e2e-spec.ts` (create)

**Interfaces:**
- Consumes: `defineEndpoint(kind, file, params)`, `getCallsiteFile()`, `WithDecorator`, `HandlerMethod`.
- Produces:
  - `type RouterInjectProviders = Record<string, Type<any> | WithDecorator<any>> | undefined` and `type RouterInjectOnRequest = Record<string, WithDecorator<any>> | undefined`.
  - `EndpointBuilder<RI extends RouterInjectProviders = undefined, RR extends RouterInjectOnRequest = undefined>`: the existing builder type, with the handler typed over `Merge<RI, InjectProviders>` and `Merge<RR, InjectOnRequestParameters>` (`Merge<A, B>` = the defined side when the other is `undefined`, else `A & B`). The endpoint's own `inject` / `injectOnRequest` keys may not be keys of `RI` or `RR` (type error).
  - `createRouterEndpoint(routerFile: string, inject: RouterInjectProviders, injectOnRequest: RouterInjectOnRequest): { query: EndpointBuilder<RI, RR>; mutation: EndpointBuilder<RI, RR> }`, internal, not exported from `index.ts`.
  - `defineEndpoint(kind, file, params, routerFile?: string)`: the fourth argument records the building router on the class as metadata `'endpoints:routerFile'` (Task 3 reads it).
  - `EndpointRouterModule.create<RI, RR>(params?: EndpointRouterModuleParams & { inject?: RI; injectOnRequest?: RR }): Promise<DynamicModule> & { endpoint: { query: EndpointBuilder<RI, RR>; mutation: EndpointBuilder<RI, RR> } }`; `register()` the same.

Fixture shape. Both import forms are covered: the documented one (`import router from './router.module'` then `router.endpoint.query(...)`, the router module a single `export default EndpointRouterModule.create({...})`), and a named re-export (`const router = …; export const { endpoint } = router; export default router;`).
- `workspace/router.module.ts`: named re-export form. `create({ namespace: true, providers: [WorkspaceService], inject: { workspace: WorkspaceService }, injectOnRequest: { tenant: decorated<string>(Headers('x-tenant')) } })`.
- `whoami.endpoint.ts`: default-import form, `router.endpoint.query` with its own `injectOnRequest: { agent: decorated<string>(Headers('user-agent')) }`, output `{ workspace: string; tenant: string; agent: string }` where `workspace` is `WorkspaceService#name()` returning `'acme'`.
- `members/list.endpoint.ts`: named form, `endpoint.query`, no own injections, output `{ workspace, tenant }`.
- `legacy.endpoint.ts`: `endpoint.query` with deprecated `injectAtRequest: { agent: ... }`, output `{ tenant, agent }`.
- `billing/router.module.ts`: nested, documented form (default export only), `namespace: true`, `providers: [BillingService]`, `inject: { billing: BillingService }`.
- `billing/endpoints/invoice.endpoint.ts`: `router.endpoint.query` from `../router.module`, output `{ billing: string; hasWorkspace: boolean }` with `hasWorkspace: 'workspace' in params` (the handler's whole params object).

In the spec, import endpoint classes with `await import(...)` after the app compiles (in a `beforeAll`), never statically: a static import evaluates an endpoint outside any router, and it keeps the default path it is given then.

- [ ] **Step 1: Write the failing tests**

In `router-injections.e2e-spec.ts`, with the app from `AppModule` via `createApp`:

```ts
test('a router injects into the endpoints it owns, with their own injections', async () => {
  await req.post('/workspace/whoami').set('x-tenant', 't1').set('user-agent', 'ua')
    .expect(200, { workspace: 'acme', tenant: 't1', agent: 'ua' });
});
test('endpoints in a subfolder get the router injections', async () => {
  await req.post('/workspace/members/list').set('x-tenant', 't1')
    .expect(200, { workspace: 'acme', tenant: 't1' });
});
test('deprecated injectAtRequest merges with the router injectOnRequest', async () => {
  await req.post('/workspace/legacy').set('x-tenant', 't1').set('user-agent', 'ua')
    .expect(200, { tenant: 't1', agent: 'ua' });
});
test('a nested router endpoints get none of the parent injections', async () => {
  await req.post('/workspace/billing/invoice').expect(200, { billing: 'billing', hasWorkspace: false });
});
test('invoke() sees the router inject', async () => {
  const fixture = await Test.createTestingModule({ controllers: [membersList], providers: [WorkspaceService] }).compile();
  // injectOnRequest is not supplied by invoke(), as for an endpoint's own.
  await expect(fixture.get(membersList).invoke()).resolves.toEqual({ workspace: 'acme', tenant: undefined });
});
test('gets its path from its own file', () => {
  expect(Reflect.getMetadata('endpoints:path', membersList)).toBe('/workspace/members/list');
});
test('a key the router already injects is an error', () => {
  expect(() =>
    workspaceEndpoint.query({
      // @ts-expect-error `workspace` is injected by the router
      inject: { workspace: WorkspaceService },
      handler: () => null,
    }),
  ).toThrow(/router-injections\.e2e-spec[\s\S]*`workspace`/);
  expect(() =>
    workspaceEndpoint.query({
      // @ts-expect-error `tenant` is injected on request by the router
      inject: { tenant: WorkspaceService },
      handler: () => null,
    }),
  ).toThrow(/`tenant`/);
});
```

Run the `gets its path` test after the app compiles (the router sets it up). Add a type-only block (checked by `tscheck`): the `whoami` handler's params include `workspace: WorkspaceService`, `tenant: string`, `agent: string`; a handler built from `EndpointRouterModule.create({}).endpoint` sees only its own keys (`expectTypeOf` from vitest).

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/test/test-app-express && pnpm exec nestjs-endpoints generate && cd - && pnpm --filter nestjs-endpoints build && cd packages/test/test-app-express && pnpm test:e2e run test/router-injections.e2e-spec.ts`
Expected: FAIL (`router.endpoint` is undefined; `create()` rejects unknown keys at the type level).

- [ ] **Step 3: Implement**

- `createRouterEndpoint`: `query` / `mutation` are arrows calling `defineEndpoint(kind, getCallsiteFile(), merged, routerFile)` directly, the same depth as the package's builders. Before merging, resolve the endpoint's `injectOnRequest ?? injectMethod ?? injectAtRequest`; throw if any of its `inject` or resolved `injectOnRequest` keys is a key of the router's `inject` or `injectOnRequest`, message `endpoint.${kind}() in ${file}: \`${key}\` is already injected by its router (${routerFile}).` Pass the merged maps as `inject` / `injectOnRequest` and drop the deprecated keys.
- `create` / `register`: compute the builder from `getCallsiteFile()` (already read there) and `params?.inject` / `params?.injectOnRequest`, assign it as `endpoint` on the `LazyPromise`, return it typed as in Interfaces. Add `inject` and `injectOnRequest` with doc comments to the `_register` params type (unused there).

- [ ] **Step 4: Run the tests, then the full gate**

Run: the Step 2 command, then `scripts/test.sh`
Expected: PASS everywhere, `tscheck` clean in all test apps.

- [ ] **Step 5: Report the diff (do not commit)**

---

### Task 3: An endpoint built with another router's builder fails startup

**Files:**
- Modify: `packages/nestjs-endpoints/src/consts.ts` (`settings.endpoints[].setupFn` arg), `endpoint-fn.ts` (`setupFn`), `endpoint-router.module.ts` (both `setupFn` call sites)
- Create fixture: `packages/test/test-app-express/src/misrouted/router.module.ts` (no injections, not imported by `AppModule`), `misrouted/endpoints/borrowed.endpoint.ts` (built with `workspace/router.module`'s `endpoint`), `misrouted/listed.router.ts` (a non-discovered module file: `EndpointRouterModule.create({ endpoints: [whoami] })`, imported by no one but the spec)
- Test: `packages/test/test-app-express/test/router-injections.e2e-spec.ts`

**Interfaces:**
- Consumes: `'endpoints:routerFile'` metadata from Task 2; `isSameModule`.
- Produces: `setupFn` takes `routerFile: string` in its settings object; routers pass their `callsiteFile`. The package's own `endpoint` records no router file and is never checked.

- [ ] **Step 1: Write the failing tests**

```ts
test('an endpoint built with another router builder fails startup', async () => {
  const { default: Misrouted } = await import('../src/misrouted/router.module');
  await expect(Test.createTestingModule({ imports: [Misrouted] }).compile()).rejects.toThrow(
    /borrowed\.endpoint[\s\S]*workspace[\/\\]router\.module[\s\S]*misrouted[\/\\]router\.module/,
  );
});
test('listing another router endpoint in endpoints fails the same way', async () => {
  const { default: Listed } = await import('../src/misrouted/listed.router');
  await expect(Test.createTestingModule({ imports: [Listed] }).compile()).rejects.toThrow(/whoami\.endpoint/);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: regenerate the manifest, build, then `pnpm test:e2e run test/router-injections.e2e-spec.ts`
Expected: FAIL (both compile).

- [ ] **Step 3: Implement the check in `setupFn`**

First thing in `setupFn`, before any decorator is applied (a listed endpoint may already have been set up once): when the class has a recorded router file and `routerFile` is given and `!isSameModule(recorded, routerFile)`, throw `${file} is built with the endpoint of ${recorded} but is owned by ${routerFile}. Import \`endpoint\` from the router module that owns it.` (paths relative to `process.cwd()`). The standalone call (no store) passes no `routerFile`.

- [ ] **Step 4: Run the tests, then the full gate**

Run: the Step 2 command, then `scripts/test.sh`
Expected: PASS. `AppModule` boots (the misrouted fixture is outside its tree).

- [ ] **Step 5: Report the diff (do not commit)**

---

### Task 4: Docs and changelog

**Files:**
- Modify: `README.md` (`## Dependency injection` and `### Nested router modules`), `packages/nestjs-endpoints/docs/agents.md` (2.2 options table, 3.5 Dependency injection, 5.4 Nested routers, 13 Troubleshooting), `packages/nestjs-endpoints/assets/skill.md` (`description`), `CHANGELOG.md`

- [ ] **Step 1: README**

Under Dependency injection, a "Router injections" subsection: the router module unchanged in shape (`export default EndpointRouterModule.create({ inject, injectOnRequest, … })`), an endpoint doing `import router from './router.module'` and `export default router.endpoint.mutation({...})`, one line that `export const { endpoint } = router` also works for a plain `endpoint.mutation(...)`, what the handler receives, that a key collision is an error, the owning-router-only rule and that nested routers declare their own, providers resolving in the router's module, and the import rule (nothing the router module imports may import its `endpoint`; the "Cannot access 'endpoint' before initialization" error). One line under Nested router modules pointing to it.

- [ ] **Step 2: agents.md and skill description**

Mirror the README content in 3.5 and 2.2 (`inject`, `injectOnRequest` rows; `endpoint` on the returned promise), one line in 5.4, and two troubleshooting entries: the TDZ error and the wrong-router startup error, each with its fix. Add "router-level `inject` / `injectOnRequest` and the router's `endpoint` builder" to the skill `description`'s dependency-injection clause.

- [ ] **Step 3: Changelog**

Use the `clean-changelog-entry` skill to add one entry under the topmost release's `### Features`, e.g. `**Router modules declare \`inject\` and \`injectOnRequest\` for every endpoint they own, through the router's \`endpoint\` builder.** See [Router injections](README.md#router-injections).`

- [ ] **Step 4: Grep for stale docs**

Run: `grep -rn "injectOnRequest\|EndpointRouterModule.create" README.md packages/nestjs-endpoints/docs packages/nestjs-endpoints/assets`
Expected: every hit is consistent with the new surface.

- [ ] **Step 5: Report the diff (do not commit)**
