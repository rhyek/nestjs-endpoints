---
name: nestjs-endpoints
description: Use when working on an HTTP API built with nestjs-endpoints, or when unsure whether this repo uses it (the guide says how to tell) — creating, editing, moving, or deleting an endpoint (`endpoint.query()` / `endpoint.mutation()`); how a file's location maps to its URL (`$param` path parameters, `_`-prefixed folders, `endpoint.ts` vs `*.endpoint.ts`); `router.module.ts` routers, `basePath`, providers, middleware, interceptors, or guards; Zod `input` / `query` / `params` / `output` schemas or multi-status responses; dependency injection via `inject` / `injectOnRequest` / `decorated`; OpenAPI output and the docs viewer; the endpoint manifest (`endpoints.gen.ts`, `nestjs-endpoints generate`); `setupCodegen` and the generated axios / `@tanstack/react-query` client SDK, its namespaces and namespace filters; calling that client from a front-end or a test, including `queryOptions` / `mutationOptions` and `schemas.input` / `schemas.query`; or testing endpoints with supertest, the generated client, or `invoke()`.
---

# nestjs-endpoints

`nestjs-endpoints` writes clean, end-to-end type-safe HTTP APIs on NestJS. One
`endpoint.query({...})` or `endpoint.mutation({...})` call becomes a real
NestJS controller; Zod schemas give you runtime validation, an OpenAPI 3.1.1
document, and generated axios / react-query clients. Routes come either from
where the file sits on disk (file-based routing) or from an explicit `path`.

The consolidated guide ships inside the installed `nestjs-endpoints` package, so
it always matches the version currently in `node_modules`. It covers the full
`endpoint.query()` / `endpoint.mutation()` and `EndpointRouterModule.create()`
reference, the file → URL rules, namespaces and SDK naming, codegen, the
generated client's call conventions, testing, and a troubleshooting table.

**Read it now, before acting**, with the Read tool:

```
${CLAUDE_PROJECT_DIR}/node_modules/nestjs-endpoints/docs/agents.md
```

That should already read as an absolute path. If it still shows an unresolved
placeholder, your harness does not substitute them — read
`node_modules/nestjs-endpoints/docs/agents.md` resolved from the repository
root instead, NOT from this skill's own directory, which has no `node_modules`
under it. In a monorepo the package may be hoisted to the workspace root or
installed under the individual package — check both.

Nothing loads the guide for you. That path is deliberately not an `@` reference:
`@` force-loads the whole file, which defeats the progressive disclosure a skill
exists to provide. If you have not run Read, you have not seen it.
