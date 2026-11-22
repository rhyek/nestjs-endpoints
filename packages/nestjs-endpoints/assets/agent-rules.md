# nestjs-endpoints

One or more of this repo's HTTP APIs are built with nestjs-endpoints: their endpoints
(`endpoint.query()`, `endpoint.mutation()`), routers (`router.module.ts`), Zod schemas, and the
axios and React Query clients generated from them.

Before you add, change, move or test an endpoint or a router, or generate or call a client, read
the docs of the version the API you are working on installed. From that API's directory (the
repo's root, when it has one API), find them with
`node -p "require.resolve('nestjs-endpoints/docs/llms.txt')"`, and read the file it prints, then
the agent playbook it starts with, then the page it names for the task. If the command finds
nothing, read https://nestjs-endpoints.dev/llms.txt, which describes the latest release.
