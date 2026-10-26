# nestjs-endpoints

![PR workflow](https://github.com/rhyek/nestjs-endpoints/actions/workflows/pr.yaml/badge.svg)

## Introduction

**nestjs-endpoints** is a lightweight tool for writing clean, succinct, end-to-end type-safe HTTP APIs with NestJS that encourages the [REPR](https://www.apitemplatepack.com/docs/introduction/repr-pattern/) design pattern, code colocation, and the Single Responsibility Principle.

It's inspired by the [Fast Endpoints](https://fast-endpoints.com/) .NET library, [tRPC](https://trpc.io/), and [TanStack Router](https://tanstack.com/router)'s file-based routing.

An endpoint can be as simple as this:

`src/greet.endpoint.ts`

```ts
export default endpoint.query({
  input: z.object({
    name: z.string(),
  }),
  output: z.string(),
  inject: {
    helloService: HelloService,
  },
  handler: ({ input, helloService }) => helloService.greet(input.name),
});
```

```bash
❯ curl -X POST 'http://localhost:3000/greet' \
-H 'Content-Type: application/json' -d '{"name": "Satie"}'
Hello, Satie!%
```

```ts
// axios call
const greeting = await client.greet({ body: { name: 'Satie' } });

// react-query hook
const { data: greeting } = client.useGreet({ body: { name: 'Satie' } });
```

## Features

- **Stable:** Produces regular **NestJS Controllers** under the hood.
- **Two routing styles:** manual imports with explicit paths, or file-based routing that scans your project.
- **Module-scoped middleware, interceptors, and guards** — a gap in vanilla NestJS.
- **Schema validation:** compile- and run-time validation of input and output using Zod.
- **OpenAPI 3.1.1:** generated via `@nestjs/swagger` + [zod-openapi](https://github.com/samchungy/zod-openapi). Integrated [Scalar](https://scalar.com) doc viewer (Swagger UI as fallback).
- **End-to-end type safety:** `axios` and `@tanstack/react-query` client libraries auto-generated with [Kubb](https://kubb.dev/).
- **Namespaced SDK:** opt-in router namespaces surface generated hooks and methods as a nested client object that mirrors the router hierarchy (`client.shop.recipes.create(...)` and `client.shop.recipes.useCreate(...)` side by side); each client can be filtered to a subset of namespaces.
- **Adapter-agnostic:** Express or Fastify.

## Example

Full runnable example [here](./examples/file-based-routing) — NestJS API with nested router modules and namespaces, plus a minimal React + `@tanstack/react-query` front-end consuming the generated SDK.

## Requirements

- Node.js >= 24
- NestJS >= 12
- TypeScript >= 6
- Zod >= 4.1

This package is **ESM-only**. CommonJS projects are not supported.

## Installation

```bash
npm install nestjs-endpoints @nestjs/swagger zod
```

Then set the project up:

```bash
npx nestjs-endpoints init
```

This writes the [endpoint manifest](#the-endpoint-manifest) that file-based
routing loads endpoints through, and installs the agent skill below.

### Coding agents

The package ships an agent guide — the complete reference for
`endpoint.query()` / `endpoint.mutation()`, file-based routing, routers,
namespaces, codegen, and the generated client — at
`node_modules/nestjs-endpoints/docs/agents.md`.

`npx nestjs-endpoints init` installs a skill that points your coding agent at
it: it writes `.claude/skills/nestjs-endpoints/SKILL.md` (mirroring into
`.agents/` and `.cursor/` when those already exist), and rewrites it from the
current template every time — the file is managed, as its banner says. Re-run it
after upgrading, or wire `npx nestjs-endpoints init --refresh` into a
`postinstall` hook: that form rewrites only an unedited skill file that is out of
date, and is a no-op otherwise.

## Setup

The idiomatic path is automatic file-based routing; traditional manual imports are also supported, and the two can be mixed.

### Option 1. Automatic (file-based routing)

`src/endpoints/status/health.endpoint.ts`

```typescript
import { endpoint } from 'nestjs-endpoints';

export default endpoint.query({
  // A probe calls it with a GET.
  method: 'get',
  inject: {
    health: HealthService,
  },
  handler: ({ health }) => health.check(),
});
```

`src/app.module.ts`

```typescript
import { EndpointRouterModule } from 'nestjs-endpoints';
import './endpoints.gen.js';

@Module({
  imports: [
    EndpointRouterModule.create({
      rootDirectory: './endpoints',
      providers: [HealthService],
    }),
  ],
})
export class AppModule {}
```

Endpoint available at `GET /status/health`.

`src/endpoints.gen.ts` is the [endpoint manifest](#the-endpoint-manifest), written by `npx nestjs-endpoints init`. Commit it, and run `nestjs-endpoints generate` before the scripts that start the app so it is always current.

### Option 2. Traditional

Import endpoints like regular NestJS controllers. No extra setup.

`src/health-check.ts`

```typescript
import { endpoint } from 'nestjs-endpoints';

export const healthCheck = endpoint.query({
  path: '/status/health',
  method: 'get',
  inject: {
    health: HealthService,
  },
  handler: ({ health }) => health.check(),
});
```

`src/app.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { healthCheck } from './health-check';

@Module({
  controllers: [healthCheck],
  providers: [HealthService],
})
class AppModule {}
```

Endpoint available at `GET /status/health`.

## Usage

`src/endpoints/user/create.endpoint.ts`

```typescript
import { Session, UnauthorizedException } from '@nestjs/common';
import { decorated, endpoint, z } from 'nestjs-endpoints';

export default endpoint.mutation({
  input: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  output: z.object({
    id: z.number(),
  }),
  inject: {
    db: DbService,
  },
  injectOnRequest: {
    session: decorated<Session>(Session()),
  },
  handler: async ({ input, db, session }) => {
    if (!session.isAuthorized()) {
      throw new UnauthorizedException();
    }
    const user = await db.user.create(input);
    return {
      id: user.id,
      // Stripped during zod validation
      name: user.name,
    };
  },
});
```

Call it with:

```bash
# bad input
❯ curl -s -X 'POST' 'http://localhost:3000/user/create' \
-H 'Content-Type: application/json' \
-d '{"name": "Art", "emailTYPO": "art@gmail.com"}' | jq
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": [
        "email"
      ],
      "message": "Required"
    }
  ]
}

# success
❯ curl -X 'POST' 'http://localhost:3000/user/create' \
-H 'Content-Type: application/json' \
-d '{"name": "Art", "email": "art@vandelayindustries.com"}'
{"id":1}%
```

## Queries and mutations

Every endpoint is defined with `endpoint.query()` or `endpoint.mutation()`. Both take the same options and serve the same way; the builder decides whether the [generated react-query client](#react-query) gives the operation a query hook or a mutation hook.

An endpoint is a `POST`, and its `input` is the JSON body; a request without a body reads as `{}`, unless `input` accepts a missing body (`.optional()`). On Fastify, a request that sends `Content-Type: application/json` with no body is answered `400` before it reaches the endpoint. Search parameters are declared apart from the body, with `query`, on any method:

```ts
// src/endpoints/issues/list.endpoint.ts → POST /issues/list?page=2
export default endpoint.query({
  query: z.object({ page: z.coerce.number().default(1) }),
  input: z.object({ status: z.enum(['open', 'closed']) }),
  inject: { issues: IssuesRepository },
  handler: ({ query, input, issues }) =>
    issues.list(input.status, query.page),
});
```

```ts
await client.issuesList({ query: { page: 2 }, body: { status: 'open' } });
```

`method` sets another HTTP method, for a caller other than the generated client that needs one, such as an OAuth callback or a download link that must be a `GET`. A `GET` carries no body, so an endpoint with `method: 'get'` takes `query` but not `input`: declaring `input` there is a type error, and throws when the endpoint is defined.

```ts
// src/endpoints/auth/callback.endpoint.ts → GET /auth/callback?code=…&state=…
export default endpoint.query({
  method: 'get',
  query: z.object({ code: z.string(), state: z.string() }),
  inject: { auth: AuthService },
  handler: ({ query, auth }) => auth.complete(query.code, query.state),
});
```

Search parameters arrive as strings: read numbers with `z.coerce.number()` and booleans with `z.stringbool()`. For nested-object search parameters, [configure](https://docs.nestjs.com/controllers#query-parameters) the Express or Fastify adapter accordingly.

An endpoint answers `200` unless its handler returns another status with `response(status, body)`.

## Dependency injection

An endpoint maps onto the two tiers of DI you already know from vanilla NestJS:

- **`inject`** — class-level providers, resolved once per endpoint instance. Equivalent to constructor-injected providers on a controller.

  ```ts
  inject: {
    db: DbService;
  }
  // ≡
  @Controller()
  class X {
    constructor(private readonly db: DbService) {}
  }
  ```

- **`injectOnRequest`** — per-request values pulled in at handler time. Equivalent to parameter decorators like `@Req()`, `@Session()`, `@Headers()` on a controller method.

  ```ts
  injectOnRequest: {
    session: decorated<Session>(Session())
  }
  // ≡
  @Post()
  async create(@Session() session: Session) {}
  ```

  `decorated<T>(decorator)` pairs a NestJS parameter decorator with the TypeScript type you want visible on the handler.

### Router injections

A router module can declare `inject` and `injectOnRequest` once, in `endpointConfig`. `create()` returns the router with an `endpoint` builder, and each endpoint built with it receives the router's injections along with its own:

```ts
// src/workspace/router.module.ts
export default EndpointRouterModule.create({
  providers: [WorkspaceService, AuditService],
  endpointConfig: {
    inject: { workspace: WorkspaceService },
    injectOnRequest: { user: decorated<User>(CurrentUser()) },
  },
});
```

```ts
// src/workspace/rename.endpoint.ts
import router from './router.module';

export default router.endpoint.mutation({
  input: z.object({ name: z.string() }),
  inject: { audit: AuditService },
  handler: ({ input, workspace, user, audit }) => {
    /* … */
  },
});
```

A router module can also re-export the builder, so its endpoints write `endpoint.mutation(...)` with `import { endpoint } from './router.module'`:

```ts
// src/workspace/router.module.ts
const router = EndpointRouterModule.create({
  // …the options above
});
export const { endpoint } = router;
export default router;
```

- The injections reach only the endpoints the router owns, its subfolders included, that are built with its `endpoint`: not one built with the package's `endpoint`, nor those of a [nested router](#nested-router-modules), which declares its own. An endpoint built with the `endpoint` of a router that declares injections fails at startup if another router owns it.
- Declaring a key the router already injects, in either map, is a type error, `` `workspace` is already injected by its router ``, and throws when the endpoint is defined. The router's own key goes in one of its two maps: a key in both is a type error, `` `user` is in both inject and injectOnRequest ``, and `create()` throws.
- What the router's `inject` names must resolve in the router's module, as an endpoint's own does: list it in the router's `providers`, or export it from a module the router `imports`.
- An endpoint carries the injections however it is loaded. [Compiled on its own in a test](#integration-tests), it gets them too (list the providers the router's `inject` names in the testing module), and `invoke()` sees the router's `inject`.
- A router that lists its endpoints by hand lists them with a callback, which it calls when it runs, once the router module has loaded. Each `import()` lists every endpoint the module exports, default or named:

  ```ts
  export default EndpointRouterModule.create({
    endpointConfig: { inject: { workspace: WorkspaceService } },
    endpoints: () => [
      import('./list.endpoint.js'),
      import('./find.endpoint.js'),
    ],
  });
  ```

- Nothing the router module imports statically, directly or through a provider, a guard or an endpoint in an `endpoints: [...]` array, may import its `endpoint`. That is an import cycle, and fails at load: Node reports `Cannot access 'router' before initialization`, naming the binding the importing file used; Vitest reports `Cannot read properties of undefined (reading 'endpoint')`, or `'query'` / `'mutation'` with the re-exported builder. Move what the router module needs out of that file, or list the endpoint with a callback.

## Endpoint router

`EndpointRouterModule.create({...})` finds the `*.endpoint.ts` and `router.module.ts` files in its subtree, auto-registers them, and derives each endpoint's HTTP path using file-based routing.

Each router owns its own URL prefix, providers, middleware, interceptors, guards, and SDK namespace; nested routers compose with their parent's.

### File-based routing

HTTP paths for endpoints are derived from each file's position on disk.

Router-level rules:

- `rootDirectory` is trimmed from the start of every path it owns
- Optional `basePath` is prepended

Endpoint-file rules:

- Filenames must either end in `.endpoint.ts` or be `endpoint.ts` (`js`, `mjs`, `mts` also supported)
- Path segments that begin with an underscore (`_`) are removed
- Path parameters: a `$`-prefixed segment becomes a `:param` (TanStack Router-style)
- A `.` inside one filename or folder splits it into multiple URL segments
- Each declared param must be validated with the `params` Zod schema on the endpoint

Examples (assume `rootDirectory` is `./endpoints`):

| File                                                             | URL                                               |
| ---------------------------------------------------------------- | ------------------------------------------------- |
| `../user/find-all.endpoint.ts`                                   | `user/find-all`                                   |
| `../user/_mutations/create/endpoint.ts`                          | `user/create`                                     |
| `../recipes/edit/$recipeId.endpoint.ts`                          | `recipes/edit/:recipeId`                          |
| `../recipes/$recipeId.view/endpoint.ts`                          | `recipes/:recipeId/view`                          |
| `../recipes/$recipeId.delete.endpoint.ts`                        | `recipes/:recipeId/delete`                        |
| `../restaurant/$restaurantId/recipes/$recipeId.view/endpoint.ts` | `restaurant/:restaurantId/recipes/:recipeId/view` |

```ts
// src/endpoints/recipes/edit/$recipeId.endpoint.ts → PATCH /recipes/edit/:recipeId
export default endpoint.mutation({
  method: 'patch',
  // Path-param keys must match the URL `:names`. Coerce since they
  // arrive as strings.
  params: z.object({ recipeId: z.coerce.number() }),
  input: z.object({ name: z.string() }),
  inject: { recipes: RecipesRepository },
  handler: ({ params, input, recipes }) =>
    recipes.rename(params.recipeId, input.name),
});
```

The generated SDK drops `:param` segments from the method name — the typed `path` group already conveys them: `client.recipesEdit({ path: { recipeId }, body: { name } })`.

> _**Note:**_ Bundled projects via Webpack or similar are not supported.

### The endpoint manifest

Routers find and load endpoint files through `src/endpoints.gen.ts`, a generated list with one `() => import('./…')` per endpoint and router-module file. Because those imports are in your source rather than inside `node_modules`, every tool treats endpoint files like the rest of your code: Vitest transforms them with no extra config, and `node --watch` / `tsx watch` restart when the list changes.

Import it once, anywhere in the app's import graph (the app module is the natural place). Importing it loads nothing; it only tells routers where their files are.

A process can only load the endpoint files its manifest listed when it started. Run `nestjs-endpoints generate` in front of every script that starts the app, so it never starts with an out-of-date list. For tests, `"test": "nestjs-endpoints generate && vitest run"`, and the same in front of your dev server and any codegen script.

`generate` writes the file only when its contents change.

The app also checks the manifest itself:

| Where the app runs                              | What happens to the manifest                                                                                                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Development (`NODE_ENV` unset or `development`) | Checked at startup and rewritten if endpoint files were added, removed, or renamed; added endpoints are served after the next restart. While the app runs, it is rewritten on every such change, so a new endpoint is served after the restart your watcher already does. |
| Tests                                           | Checked and rewritten at startup, without watching. If endpoint files were added, that run fails asking you to run it again: it loaded the old list.                                                                                                                      |
| CI (`CI` set)                                   | Checked at startup; out of date is an error listing the files to add and remove.                                                                                                                                                                                          |
| Production (`NODE_ENV=production`)              | Used as is.                                                                                                                                                                                                                                                               |

A deleted endpoint never breaks startup: the router skips manifest entries whose file is gone. Apps that run compiled output (e.g. `nest start --watch`) find the source manifest through the emitted source map.

`generate` takes `--dir <dir>` when your sources are not in `src/`. If you run TypeScript with Node's native type stripping, which needs `.ts` import specifiers, pass `--import-extension ts` once; the setting is kept from then on.

### Nested router modules

A subdirectory can own its endpoints and providers by adding a `router.module.ts` that default-exports an `EndpointRouterModule`. The parent auto-discovers it and derives the child's `basePath` from its folder name.

```
src/
├── app.module.ts
└── endpoints/
    └── shop/
        ├── homepage.endpoint.ts
        └── recipes/
            ├── router.module.ts
            ├── repository.service.ts
            ├── endpoint.ts
            └── create.endpoint.ts
```

```typescript
// src/endpoints/shop/recipes/router.module.ts
import { EndpointRouterModule } from 'nestjs-endpoints';
import { RecipesRepository } from './repository.service';

export default EndpointRouterModule.create({
  providers: [RecipesRepository],
});
```

```bash
❯ curl -X POST 'http://localhost:3000/shop/recipes/create' \
-H 'Content-Type: application/json' -d '{"name": "Pizza"}'
{"id":1,"name":"Pizza"}

# `endpoint.ts` inherits its path from the folder, so it maps to /shop/recipes.
❯ curl -X POST 'http://localhost:3000/shop/recipes'
[{"id":1,"name":"Pizza"}]
```

A nested router does not inherit its parent's [router injections](#router-injections); it declares its own.

### Middleware, interceptors, and guards

`EndpointRouterModule.create()` accepts `middleware`, `interceptors`, and `guards` that apply to every endpoint in the router, including nested ones.

> Module-scoped interceptors and guards aren't really a thing in vanilla NestJS — you'd have to register them globally (via `APP_INTERCEPTOR` / `APP_GUARD`) or per-controller with `@UseInterceptors` / `@UseGuards` on each class. Here you declare them once on the router and they automatically apply to its whole subtree.

- `middleware`: class-based (`NestMiddleware`) or functional. The last entry may be an options object; `exclude` paths are resolved relative to the router's `basePath`.
- `interceptors`: applied via `@UseInterceptors(...)` at controller level.
- `guards`: applied via `@UseGuards(...)` at controller level.

```typescript
// src/endpoints/recipes/router.module.ts
import { IncomingMessage, ServerResponse } from 'node:http';
import { EndpointRouterModule } from 'nestjs-endpoints';
import { RecipesGuard } from './recipes.guard';
import { RecipesInterceptor } from './recipes.interceptor';
import { RecipesMiddleware } from './recipes.middleware';

export default EndpointRouterModule.create({
  middleware: [
    RecipesMiddleware, // class-based
    (_req: IncomingMessage, _res: ServerResponse, next: () => void) => {
      console.log('before handler');
      next();
    }, // functional
    { exclude: ['list'] }, // options (last); skips /recipes/list
  ],
  interceptors: [RecipesInterceptor],
  guards: [RecipesGuard],
});
```

### Namespaces

A router can opt into a namespace so its endpoints land in a nested bucket on the generated SDK client that mirrors the router hierarchy.

```typescript
// src/shop/router.module.ts
EndpointRouterModule.create({
  providers: [ShopService],
  namespace: true,
});

// src/shop/recipes/router.module.ts (nested under shop)
EndpointRouterModule.create({
  providers: [RecipesRepository],
  namespace: true,
});
```

```ts
// axios method and react-query hook live on the same bucket
await client.shop.recipes.create({ body: { name: 'Pizza' } });
const created = client.shop.recipes.useCreate();
```

`namespace` accepts:

- `false` / omitted — inherit the parent's chain.
- `true` — mirror `basePath`: use the `basePath` value if set, otherwise the router's folder name.
- `string` — explicit segment.

## Codegen (optional)

Generate a type-safe client SDK (axios and/or react-query) from your endpoints' zod schemas. Uses [Kubb](https://kubb.dev/) under the hood and works with both scanned and manually-imported endpoints. The SDK covers endpoints only: routes of plain Nest controllers appear in the OpenAPI document but not in the SDK. The react-query client requires `@tanstack/react-query` >= 5.82.

Optional: install `@scalar/api-reference` to get a [Scalar](https://scalar.com)-powered docs viewer (nicer UI, auto-generated `x-tagGroups`) when you use [`setupCodegen`'s `openapi.ui`](#using-setupcodegen) option. Without it, Swagger UI is used as the fallback.

```bash
npm install @scalar/api-reference
```

### Using `setupCodegen`

`src/main.ts`

```typescript
import { setupCodegen } from 'nestjs-endpoints';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await setupCodegen(app, {
    // Optional: builds the OpenAPI document, for the docs viewer and other
    // generators. Without it, no document is written or served.
    openapi: {
      // Optional: writes the document to a file.
      outputFile: process.cwd() + '/openapi.json',
      // Optional: mounts the docs viewer at /docs.
      ui: { path: 'docs' },
    },
    clients: [
      {
        type: 'axios',
        outputFile: process.cwd() + '/generated/axios-client.ts',
      },
      {
        type: 'react-query',
        outputFile: process.cwd() + '/generated/react-query-client.tsx',
      },
    ],
  });
  await app.listen(3000);
}
```

Each generated output file exports `createApiClient`, an `ApiClient` type, and (for react-query) `useApiClient` + `ApiClientProvider`. The client object is namespaced — operations live under buckets that mirror the router hierarchy. For react-query, every namespace bucket carries both axios methods and React Query hooks, so `client.shop.recipes.create(...)` and `client.shop.recipes.useCreate()` sit side by side.

A client is regenerated when what it is generated from changes (its endpoints' schemas, its routers' descriptions, its `type`, `namespaces` and `options`, the nestjs-endpoints version) or when its `outputFile` or the output directory beside it is missing; `forceGenerate: true` regenerates every client.

Each operation takes one object that groups its request by where it goes — `path`, `query` and `body`, typed from the endpoint's `params`, `query` and `input`. axios methods resolve to the `AxiosResponse` and reject with an `AxiosError` on a non-2xx status.

### axios

```ts
import { createApiClient } from './generated/axios-client';

const client = createApiClient({
  baseURL: process.env.API_BASE_URL,
  headers: { 'x-test': 'test-1' },
});
// Access to the underlying axios instance
client.axios.defaults.headers.common['x-test'] = 'test-2';

const { data: user } = await client.user.create({
  body: { name: 'Tom', email: 'tom@gmail.com' },
});
```

### react-query

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ApiClientProvider,
  createApiClient,
} from './generated/react-query-client';

export function App() {
  const queryClient = useMemo(() => new QueryClient({}), []);
  const apiClient = useMemo(
    () => createApiClient({ baseURL: import.meta.env.VITE_API_BASE_URL }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <UserPage />
      </ApiClientProvider>
    </QueryClientProvider>
  );
}
--
import { useApiClient } from './generated/react-query-client';

export function UserPage() {
  const client = useApiClient();

  // react-query mutation hook on the same bucket
  const userCreate = client.user.useCreate();
  const onCreate = () => userCreate.mutateAsync({ body: { ... } });

  // imperative axios call lives next to the hook
  const onPurge = () => client.user.purge();
}
```

Each operation also carries `queryKey` and `queryOptions` (an `endpoint.query()`) or `mutationKey` and `mutationOptions` (an `endpoint.mutation()`), bound to the client instance, and `schemas.input` and `schemas.query`, its `input` and `query` as JSON Schema with every `$ref` resolved:

```typescript
// A route loader, outside React, with a module-level instance
// (`export const api = createApiClient(…)`, the one you also give <ApiClientProvider>):
// it carries its base URL and interceptors.
await queryClient.ensureQueryData(
  api.user.find.queryOptions({ body: { id: 1 } }),
);

// In a component.
const create = useMutation(client.user.create.mutationOptions());

// The JSON body as JSON Schema; an operation with `query` also has `schemas.query`.
const schema = client.user.create.schemas.input;
```

See [the agent guide](packages/nestjs-endpoints/docs/agents.md#query-options-mutation-options-and-the-input-schemas) for what `schemas.input` and `schemas.query` cover and how a form library reads its type.

More examples:

- [axios](https://github.com/rhyek/nestjs-endpoints/blob/main/packages/test/test-app-express/test/client.e2e-spec.ts)
- [react-query](https://github.com/rhyek/nestjs-endpoints/tree/main/packages/test/test-react-query-client)

### Per-client namespace filter

Emit multiple client files from the same server, each limited to a subset of top-level [namespaces](#namespaces):

```typescript
await setupCodegen(app, {
  clients: [
    // Full-access backend client — every operation.
    { type: 'axios', outputFile: process.cwd() + '/generated/backend.ts' },

    // Front-end clients, each limited to the namespaces they need.
    {
      type: 'react-query',
      outputFile: process.cwd() + '/generated/admin-client.tsx',
      namespaces: ['auth', 'admin'],
    },
    {
      type: 'react-query',
      outputFile: process.cwd() + '/generated/shop-client.tsx',
      namespaces: ['auth', 'shop'],
    },
  ],
});
```

Each filtered client only ships the types its operations reference. Omit `namespaces` for full access.

### Manual codegen with OpenAPI spec file

If you only need the OpenAPI spec or want to drive your own generator (Kubb, orval, or another tool) yourself, write the document and run the generator against it. Most endpoints are `POST`s, so the HTTP method does not say which are queries: each operation carries an `x-endpoint-kind` extension, `query` for an `endpoint.query()` and `mutation` for an `endpoint.mutation()`, for your generator to choose query or mutation helpers by.

`src/main.ts`

```typescript
import { setupOpenAPI } from 'nestjs-endpoints';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const { document, changed } = await setupOpenAPI(app, {
    configure: (builder) => builder.setTitle('My Api'),
    outputFile: process.cwd() + '/openapi.json',
  });
  if (changed) {
    // Run your OpenAPI generator of choice against ./openapi.json here.
  }
  await app.listen(3000);
}
```

## Advanced Usage

A fuller endpoint example: multi-status output, per-endpoint decorators, request-time injection.

`src/endpoints/user/appointment/create.endpoint.ts`

```typescript
import { Inject, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { decorated, endpoint, schema, z } from 'nestjs-endpoints';

export default endpoint.mutation({
  summary: 'Create an appointment',
  input: z.object({
    userId: z.number(),
    date: z.coerce.date(),
  }),
  output: {
    201: schema(
      z.object({
        id: z.number(),
        date: z.date().transform((date) => date.toISOString()),
        address: z.string(),
      }),
      {
        description: 'Appointment created',
      },
    ),
    400: z.union([
      z.string(),
      z.object({
        message: z.string(),
        errorCode: z.string(),
      }),
    ]),
  },
  // Per-endpoint decorators. Guards, interceptors, and middleware that
  // should apply to every endpoint in the router can instead be passed
  // to `EndpointRouterModule.create({ guards, interceptors, middleware })`.
  decorators: [UseGuards(AuthGuard)],
  inject: {
    db: DbService,
    appointmentsRepository: decorated<IAppointmentRepository>(
      Inject(AppointmentRepositoryToken),
    ),
  },
  injectOnRequest: {
    req: decorated<Request>(Req()),
  },
  handler: async ({
    input,
    db,
    appointmentsRepository,
    req,
    response,
  }) => {
    const user = await db.find(input.userId);
    if (!user) {
      // Need to use response fn when multiple output status codes
      // are defined
      return response(400, 'User not found');
    }
    if (await appointmentsRepository.hasConflict(input.date)) {
      return response(400, {
        message: 'Appointment has conflict',
        errorCode: 'APPOINTMENT_CONFLICT',
      });
    }
    return response(
      201,
      await appointmentsRepository.create(
        input.userId,
        input.date,
        req.ip,
      ),
    );
  },
});
```

To call this endpoint:

```bash
❯ curl -X 'POST' 'http://localhost:3000/user/appointment/create' \
-H 'Content-Type: application/json' \
-H 'Authorization: secret' \
-d '{"userId": 1, "date": "2021-11-03"}'
{"id":1,"date":"2021-11-03T00:00:00.000Z","address":"::1"}%
```

## Handling ZodEffects in output schemas

`.transform()` in an output schema produces a `ZodEffect` whose runtime type can't always be inferred for OpenAPI ([more info](https://github.com/samchungy/zod-openapi?tab=readme-ov-file#effecttype)). Use `.overwrite()` or `.meta({ type: ... })` instead:

```typescript
// Use .overwrite for same-type transforms:
z.string().overwrite((s) => s.toUpperCase());

// Or annotate the output type:
z.string()
  .transform((s) => s.toUpperCase())
  .meta({ type: 'string' });
```

Dates convert to an ISO date-time or date in requests and an ISO date-time in responses. A `z.bigint()` needs `.meta({ type })` on the bigint itself, not on a wrapper such as `.optional()`, saying what travels (for example `z.coerce.bigint().meta({ type: 'string' }).optional()`); without it, startup throws.

## Testing

### End-to-end tests

Use the generated client or `supertest`.

```ts
test('client library', async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication();
  await app.init();
  await app.listen(0);
  const client = createApiClient({
    baseURL: await app.getUrl(),
  });
  await expect(
    client.userFind({ body: { id: 1 } }),
  ).resolves.toMatchObject({
    data: {
      id: 1,
      email: 'john@hotmail.com',
    },
  });
});

test('supertest', async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication();
  await request(app.getHttpServer())
    .post('/user/find')
    .send({ id: 1 })
    .expect(200)
    .then((resp) => {
      expect(resp.body).toMatchObject({
        id: 1,
        email: 'john@hotmail.com',
      });
    });
});
```

### Testing one router

Import a router module without the rest of the app. Import the manifest too (or list it in Vitest's `setupFiles`); it loads nothing by itself, so only that router's subtree is loaded:

```ts
import '../src/endpoints.gen';
import ShopRouterModule from '../src/shop/router.module';

test('shop router', async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [ShopRouterModule],
  }).compile();
  // ...
});
```

### Integration tests

Load individual endpoints without the full app:

```ts
import userFindEndpoint from 'src/endpoints/user/find.endpoint';

test('integration', async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    controllers: [userFindEndpoint],
    providers: [DbService],
  }).compile();
  const app = moduleFixture.createNestApplication();
  await app.init();
  const userFind = app.get(userFindEndpoint);
  await expect(userFind.invoke({ id: 1 })).resolves.toMatchObject({
    id: 1,
    email: 'john@hotmail.com',
  });
});
```
