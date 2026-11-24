# nestjs-endpoints

![CI](https://github.com/rhyek/nestjs-endpoints/actions/workflows/ci.yaml/badge.svg)

End-to-end type safety, built on NestJS controllers.

Write each endpoint as one file, with Zod schemas for its request and response and a handler.
nestjs-endpoints serves it at a route that comes from where the file sits, hands it the path
parameters, providers and guards the routers of its folders declare, validates what goes in and
out, and generates a typed axios or React Query client from the same schemas.

**Documentation: [nestjs-endpoints.dev](https://nestjs-endpoints.dev)**

## Features

- **NestJS controllers underneath.** Modules, providers, guards, interceptors and the Express,
  Fastify and `node:http` adapters work as they do in any Nest app.
- **File-based routing.** An endpoint's URL is its path in the folder, or a `path` you give it.
- **Validation and types from one schema.** Bodies, search parameters and path parameters are
  parsed before the handler runs, and a response that doesn't match its schema doesn't compile.
- **Generated clients.** A typed axios client or React Query hooks, nested by the routers'
  namespaces.
- **Routers that share down the tree.** A `router.ts` declares a folder's path parameters,
  providers, guards, middleware and interceptors once, for every endpoint under it and every
  router nested in it.
- **State and lifecycle hooks.** An endpoint or a router keeps its own properties and methods,
  and runs NestJS's lifecycle hooks.
- **Built for coding agents.** An agent rules file and a skill that point an agent at the docs
  shipped inside the package, and a `/nestjs-endpoints-refactor` skill that reworks an API to
  the [recommended architecture](https://nestjs-endpoints.dev/guide/architecture).

## Install

```bash
npm install nestjs-endpoints zod
```

Requires Node.js 24.22, NestJS 12, TypeScript 6 and Zod 4.1 or newer, in an ESM project.

## Quick start

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { NestjsEndpoints } from 'nestjs-endpoints';

@Module({
  imports: [NestjsEndpoints.forRoot({ router: { rootDirectory: './endpoints' } })],
})
export class AppModule {}
```

```ts
// src/endpoints/greet.endpoint.ts  →  POST /greet
import { endpoint, z } from 'nestjs-endpoints';

export default endpoint.query({
  input: z.object({ name: z.string() }),
  output: z.string(),
  handler: ({ input }) => `Hello, ${input.name}!`,
});
```

```ts
// with the generated clients
const greeting = await client.greet({ body: { name: 'Satie' } });
const { data } = client.useGreet({ body: { name: 'Satie' } });
```

## Documentation

- [Getting started](https://nestjs-endpoints.dev/guide/getting-started)
- [Recommended architecture](https://nestjs-endpoints.dev/guide/architecture)
- [Writing an endpoint](https://nestjs-endpoints.dev/guide/endpoints)
- [File-based routing](https://nestjs-endpoints.dev/guide/file-based-routing)
- [Generating clients](https://nestjs-endpoints.dev/clients/codegen)
- [Testing](https://nestjs-endpoints.dev/guide/testing)
- [Built for agents](https://nestjs-endpoints.dev/ai/overview)

A complete example, an API with a React front end, is in
[`examples/file-based-routing`](https://github.com/rhyek/nestjs-endpoints/tree/main/examples/file-based-routing).

For coding agents, the docs are indexed at
[nestjs-endpoints.dev/llms.txt](https://nestjs-endpoints.dev/llms.txt), and ship inside the
package at `node_modules/nestjs-endpoints/docs/llms.txt`.

## License

MIT
