---
name: nestjs-endpoints
description: Use when working on an HTTP API in this repo that is built with nestjs-endpoints — creating, editing, moving, or deleting an endpoint; answering how a file's location maps to its URL (including `$param` path parameters, `_`-prefixed folders, and `endpoint.ts` vs `*.endpoint.ts`); adding or restructuring `router.module.ts` routers, their `basePath`, providers, middleware, interceptors, or guards; declaring Zod `input` / `params` / `output` schemas or multi-status responses; wiring dependency injection via `inject` / `injectOnRequest` / `decorated`; setting up or debugging OpenAPI output and the docs viewer; configuring `setupCodegen` and the generated axios / `@tanstack/react-query` client SDK, including namespaces and per-client namespace filters; calling that generated client from a front-end or a test; or writing tests for endpoints with supertest, the generated client, or `invoke()`. Also use when you don't yet know whether this repo uses nestjs-endpoints at all — the guide's first section covers how to tell.
---

# nestjs-endpoints

`nestjs-endpoints` writes clean, end-to-end type-safe HTTP APIs on NestJS. One
`endpoint({...})` call becomes a real NestJS controller; Zod schemas give you
runtime validation, an OpenAPI 3.1.1 document, and generated axios /
react-query clients. Routes come either from where the file sits on disk
(file-based routing) or from an explicit `path`.

The consolidated guide ships inside the installed `nestjs-endpoints` package, so
it always matches the version currently in `node_modules`. It covers the full
`endpoint()` and `EndpointRouterModule.create()` reference, the file → URL
rules, namespaces and SDK naming, codegen, the generated client's call
conventions, testing, and a troubleshooting table.

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
