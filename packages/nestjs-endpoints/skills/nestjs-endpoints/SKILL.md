---
name: nestjs-endpoints
description: nestjs-endpoints builds one or more of this repo's HTTP APIs - each endpoint is one file (`endpoint.query()` or `endpoint.mutation()`) with Zod schemas, served at a URL that comes from where the file sits under a `router.ts`, with axios and React Query clients generated from it. Use it before you add, change, move or delete an endpoint or a router, change a URL or a path parameter, a request or response schema, an endpoint's providers, guards, interceptors or middleware, give a folder's endpoints a path parameter or an injection once on its router (`params`, `inject`, `router.child()`), set up `NestjsEndpoints.forRoot`, generate or call a client (`setupCodegen`, namespaces, `queryOptions`), build the OpenAPI document, or test an endpoint (supertest, the generated client, `invoke()`).
---

# nestjs-endpoints

nestjs-endpoints builds one or more of this repo's HTTP APIs. Its docs ship inside the installed
package, so each API's copy matches the version it installed: an index, `llms.txt`, with one line
per page, and each page as Markdown beside it.

**Read the docs of the API you are working on now, before acting.** From that API's directory
(the repository's root, when it has one API), find its copy:

```bash
node -p "require.resolve('nestjs-endpoints/docs/llms.txt')"
```

Read the file it prints with the Read tool, then the agent playbook it starts with, then the page
it names for your task. Its paths are relative to the folder it is in. If the command finds
nothing, read https://nestjs-endpoints.dev/llms.txt, which describes the latest release.

Nothing loads the docs for you: if you have not run Read, you have not seen them.
