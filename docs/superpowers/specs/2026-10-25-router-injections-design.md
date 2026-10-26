# Router injections — design

## Goal

A router module declares `inject` and `injectOnRequest` once, and every
endpoint it owns gets them, typed in its handler, without repeating them in
each endpoint file.

## API

- `EndpointRouterModule.create()` (and the deprecated `register()`) take
  `endpointConfig: { inject?, injectOnRequest? }`, with the same shapes as
  the endpoint options of the same names. Grouping them in `endpointConfig`
  says they configure the returned `endpoint` builder, not the module, and
  keeps the name apart from `endpoints`.
- `create()` still returns the `Promise<DynamicModule>` that a router module
  exports by default; the promise also carries `endpoint`, a builder with
  `query` and `mutation` typed with the router's injections. Existing router
  files are unchanged.

  ```ts
  // router.module.ts
  export default EndpointRouterModule.create({
    providers: [AccountsService],
    endpointConfig: {
      inject: { accounts: AccountsService },
      injectOnRequest: { user: decorated<User>(CurrentUser()) },
    },
  });

  // profile.endpoint.ts
  import router from './router.module';

  export default router.endpoint.query({
    inject: { audit: AuditService },
    handler: ({ accounts, user, audit }) => accounts.profile(user.id),
  });
  ```

- A router module may also re-export the builder
  (`const router = …; export const { endpoint } = router; export default router;`)
  so its endpoints write `endpoint.query(...)`.
- A router without `inject` or `injectOnRequest` hands out a builder that
  behaves like the package's `endpoint`.
- The handler's parameters include the router's keys and the endpoint's own,
  when either side declares none too.

## Behavior

- **Merged when the endpoint is defined.** The router's builder calls
  `defineEndpoint` with `inject: { ...router, ...endpoint }` and
  `injectOnRequest: { ...router, ...endpoint }`, the endpoint's side resolved
  from the deprecated `injectMethod` / `injectAtRequest` first. Nothing is
  applied at router load, so an endpoint carries its injections however it is
  loaded: by its router, or on its own in a test
  (`Test.createTestingModule({ controllers: [ep], providers: [...] })`), and
  `invoke()` sees the router's `inject` like the endpoint's own.
- **Same callsite depth.** The builder's `query` / `mutation` call
  `getCallsiteFile()` at the depth the package's builders do, so the
  endpoint's path is inferred from its own file, not `router.module.ts`.
- **Key collision is an error.** An endpoint that declares a key its router
  already injects (in either map) is a type error naming the key
  (`` `key` is already injected by its router ``), and the builder throws
  when called, naming the file and the key.
- **The owning router only.** A router's injections reach the endpoints it
  owns, its subfolders included, and not the endpoints of nested routers,
  which declare their own. The builder records its router's file; when a
  router sets up an endpoint built with another router's builder, startup
  fails naming the endpoint file and both routers. An endpoint defined with
  no router (a test) is not checked.
- **Providers resolve in the owning router's module**, as for any endpoint:
  whatever `inject` names is listed in the router's `providers` or exported
  by one of its `imports`.

## Import order

- **No cycle.** A router module never statically imports its endpoints; the
  manifest loads them with dynamic `import()` when Nest awaits the router.
  An endpoint importing its router module is a one-way edge.
- **The one rule:** nothing a router module imports itself (a provider, a
  guard, an endpoint listed in `endpoints`) may import that router's
  `endpoint`. Breaking it fails at load with "Cannot access 'endpoint' before
  initialization". The docs state it.
- **A router finds its parent by its own file.** Once endpoints import router
  modules, a router module can be evaluated before its parent runs (a spec
  imports an endpoint before the app module) or inside another router's run
  (an endpoint imports a helper that imports another folder's router).
  `create()` capturing the parent from the async-local store then gives the
  router the wrong base path and namespace. Instead, a parent records the
  context for each nested router file it discovers, before loading it, and
  `_register` reads the entry for its own file, falling back to the store
  captured at `create()` for routers no manifest discovered.

## Testing

e2e in `packages/test/test-app-express` (mirrored by `scripts/test.sh`):

- A router with `inject` and `injectOnRequest` whose endpoints, one in a
  subfolder, receive both plus their own over HTTP, and the router's
  `inject` through `invoke()`.
- The same endpoint compiled on its own in a testing module.
- An endpoint built with the router's builder gets its path from its own
  file.
- A nested router's endpoints get none of the parent's injections.
- A key collision throws when defined; `@ts-expect-error` for the type.
- An endpoint built with another router's builder fails startup (a fixture
  router outside the app module's tree).
- A spec that imports a nested router's module before the app module still
  serves its endpoints at their path and namespace. (An endpoint file itself
  imported outside any router keeps the default path it gets then; that is
  existing behavior and out of scope.)
- Types: the handler sees router and endpoint keys, either side empty.

## Docs

README (router modules), `packages/nestjs-endpoints/docs/agents.md`, the
skill's description, and a changelog entry: `inject` / `injectOnRequest` on
router modules, the `endpoint` export, owning router only, the import rule.
