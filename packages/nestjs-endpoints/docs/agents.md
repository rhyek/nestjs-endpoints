# nestjs-endpoints — agent guide

`nestjs-endpoints` turns a single `endpoint({...})` call into a real NestJS
controller. One file = one route = one handler (the REPR pattern). Input and
output are Zod schemas, which give you runtime validation, an OpenAPI 3.1.1
document, and — optionally — a fully typed `axios` / `@tanstack/react-query`
client SDK generated from that document.

This guide is the complete reference. Read the section you need; the tables near
the top answer most questions on their own.

---

## 0. Is this repo using nestjs-endpoints?

Check, in order:

1. `nestjs-endpoints` in the `dependencies` of a `package.json`.
2. Files named `*.endpoint.ts` / `endpoint.ts`, or `router.module.ts`.
3. A call to `setupCodegen(` or `setupOpenAPI(` in a `main.ts` / bootstrap file.

If none of those appear, this library is not in play — don't apply this guide.

**Everything below assumes the modern API.** These names still work but are
deprecated; never write new code with them, and prefer migrating when you touch
surrounding code:

| Deprecated | Use instead |
| --- | --- |
| `EndpointsRouterModule` | `EndpointRouterModule` |
| `EndpointsRouterModule.register(...)` | `EndpointRouterModule.create(...)` |
| `injectMethod`, `injectAtRequest` | `injectOnRequest` |

---

## 1. Requirements and hard constraints

- Node.js >= 24, NestJS >= 12, TypeScript >= 6, Zod >= 4.1.
- **ESM-only.** The consuming project needs `"type": "module"`. CommonJS is not
  supported.
- Peer deps: `@nestjs/common`, `@nestjs/core`, `@nestjs/swagger`, `zod`.
  `@scalar/api-reference` is optional (docs viewer).
- **Bundled builds (Webpack, esbuild bundling, `nest build --webpack`) are not
  supported** for file-based routing: each endpoint's URL is derived from its
  file's location on disk, which a bundle collapses into one file.
- **File-based routing needs the endpoint manifest** `src/endpoints.gen.ts`,
  imported once by the app (§5.6). `npx nestjs-endpoints init` creates it.
- Output schemas must not be `null` or `.nullable()` at the top level (NestJS
  will not send a bare `null` body). Wrap it: `z.object({ user: userSchema.nullable() })`.

---

## 2. Quick reference

### 2.1 `endpoint({...})` options

| Option | Type | Notes |
| --- | --- | --- |
| `method` | `'get' \| 'post' \| 'put' \| 'delete' \| 'patch'` | Default `'get'`. |
| `path` | `string` | Explicit HTTP path. **Required for endpoints registered manually outside a router** (see §4.2). Omit to use file-based routing. |
| `input` | Zod schema | Bound to `@Query()` when `method: 'get'`, otherwise `@Body()`. |
| `params` | Zod object | Path params. Keys must match the `:names` in the URL. |
| `output` | Zod schema, or `Record<number, Zod schema>` | Response validation + OpenAPI. Multi-status form requires `response(...)`. |
| `inject` | `Record<string, Type \| decorated<T>(...)>` | Class-level providers (≡ constructor injection). |
| `injectOnRequest` | `Record<string, decorated<T>(...)>` | Per-request values (≡ `@Req()`, `@Session()`, …). |
| `decorators` | `MethodDecorator[]` | Per-endpoint decorators, e.g. `UseGuards(AuthGuard)`. |
| `summary` | `string` | OpenAPI summary. |
| `tags` | `string[]` | Extra OpenAPI tags (an automatic one is always added — §6.2). |
| `handler` | function | Receives one object (§3.3). |

Returns a **NestJS controller class**. Use it as a `controllers:` entry, an
`endpoints:` entry, or let the router discover it via the file's default export.

### 2.2 `EndpointRouterModule.create({...})` options

Returns `Promise<DynamicModule>` — pass it straight into `imports:` or
`export default` it from a `router.module.ts`.

| Option | Type | Notes |
| --- | --- | --- |
| `rootDirectory` | `string \| string[]` | Directory/directories to scan. Relative to the **calling file**. Default: the calling file's own directory. |
| `basePath` | `string` | URL prefix for everything this router owns. Inferred when omitted (§5.2). `''` or `'/'` opts out. |
| `namespace` | `boolean \| string` | SDK bucket segment. Does **not** affect URLs (§7). |
| `description` | `string` | OpenAPI tag description + JSDoc on the generated SDK bucket. |
| `endpoints` | `Type[]` | Endpoints registered manually (they get this router's `basePath`). |
| `middleware` | `(Type<NestMiddleware> \| Function)[]` | Optional trailing `{ exclude: string[] }` entry (paths relative to `basePath`). |
| `interceptors` | `(Type<NestInterceptor> \| NestInterceptor)[]` | Applied controller-scoped to the whole subtree. |
| `guards` | `(Type<CanActivate> \| CanActivate)[]` | Applied controller-scoped to the whole subtree. |
| `imports` / `exports` / `providers` | as in `@Module` | |

### 2.3 File → URL

Assume `rootDirectory: './endpoints'` and no `basePath`.

| File | URL |
| --- | --- |
| `endpoints/greet.endpoint.ts` | `/greet` |
| `endpoints/user/create.endpoint.ts` | `/user/create` |
| `endpoints/user/_mutations/create/endpoint.ts` | `/user/create` |
| `endpoints/shop/recipes/endpoint.ts` | `/shop/recipes` |
| `endpoints/recipes/edit/$recipeId.endpoint.ts` | `/recipes/edit/:recipeId` |
| `endpoints/recipes/$recipeId.view/endpoint.ts` | `/recipes/:recipeId/view` |
| `endpoints/recipes/$recipeId.delete.endpoint.ts` | `/recipes/:recipeId/delete` |
| `endpoints/recipes/$recipeId/check-ingredients.endpoint.ts` | `/recipes/:recipeId/check-ingredients` |
| `endpoints/restaurant/$restaurantId/recipes/$recipeId.view/endpoint.ts` | `/restaurant/:restaurantId/recipes/:recipeId/view` |

### 2.4 Generated client call conventions

`fn` = axios method (returns a full `AxiosResponse`, so read `.data`).
`useFn` = the paired React Query hook.

Each operation takes one object grouping its request: `path` (path `params`),
`query` (a GET's `input`), `body` (a mutation's `input`) and `headers`.

| Endpoint shape | axios | react-query |
| --- | --- | --- |
| GET, no `input` | `fn()` | `useFn(options?)` |
| GET, `input` | `fn({ query })` | `useFn({ query }, options?)` |
| GET, all-`optional` `input` | `fn()` or `fn({ query })` | `useFn()` or `useFn({ query })` |
| GET, `params` (path) | `fn({ path })` | `useFn({ path }, options?)` |
| POST/PUT/PATCH/DELETE, `input` | `fn({ body })` | `useFn().mutateAsync({ body })` |
| …plus path `params` | `fn({ path, body })` | `useFn().mutateAsync({ path, body })` |
| …path `params`, no `input` | `fn({ path })` | `useFn().mutateAsync({ path })` |

The axios method's object also takes axios request config (`signal`,
`timeout`, …); every hook takes a trailing optional
`{ query?, mutation?, client? }` options object.

### 2.5 CLI

Run with `npx nestjs-endpoints <command>` from the project root.

| Command | What it does |
| --- | --- |
| `init` | One-time setup: writes the endpoint manifest `src/endpoints.gen.ts` (§5.6), marks `**/endpoints.gen.ts` as generated in `.gitattributes` (and `.prettierignore` if the project has one), installs the agent skill into `.claude/skills/` (mirrored into `.agents/` / `.cursor/` when present), and prints the import line to add to the app module. Safe to re-run. |
| `init --refresh` | Only rewrites an installed, unedited, out-of-date skill; no-op otherwise. Never touches the manifest. For `postinstall` hooks. |
| `generate` | Rewrites the endpoint manifest from the files on disk, only when its contents change. Put it in front of every script that starts the app (dev server, tests, codegen) so no process starts with an out-of-date manifest (§5.6). Also the fix when CI reports the manifest out of date. |
| `help`, `--version` | Usage, and the installed version. |

`init` and `generate` take:

- `--dir <dir>` — the source directory the manifest covers (default `src`).
- `--import-extension js|ts` — how the manifest's `import()` specifiers end:
  `js` (default; tsc, tsx, swc, Vite) or `ts` (Node's native type stripping).
  Without the flag, an existing manifest's setting is kept.

---

## 3. Writing an endpoint

### 3.1 The minimum

```ts
// src/endpoints/status/health.endpoint.ts  →  GET /status/health
import { endpoint } from 'nestjs-endpoints';

export default endpoint({
  handler: () => ({ ok: true }),
});
```

With no `output` schema there is no response validation and the OpenAPI
operation has no typed response — the generated SDK will type it as `any`.
**Always declare `output`** unless you have a reason not to.

### 3.2 Input, params, output

```ts
// src/endpoints/user/create.endpoint.ts  →  POST /user/create
import { endpoint, z } from 'nestjs-endpoints';
import { DbService } from './db.service';

export default endpoint({
  method: 'post',
  input: z.object({
    name: z.string(),
    email: z.email(),
  }),
  output: z.object({
    id: z.number(),
  }),
  inject: {
    db: DbService,
  },
  handler: async ({ input, db }) => {
    const user = await db.user.create(input);
    // Extra keys are stripped by the output schema before the response is sent.
    return { id: user.id, name: user.name };
  },
});
```

Rules that bite if you forget them:

- **`input` binds to `@Query()` for `method: 'get'` and to `@Body()` for every
  other method.** A GET endpoint's input therefore arrives as *strings* — use
  `z.coerce.number()`, `z.coerce.boolean()`, `z.coerce.date()`.
- **`params` always arrives as strings too** — same coercion rule.
- Input validation failure → `ZodValidationException` → HTTP **400** with
  `{ statusCode, message: 'Validation failed', errors: ZodIssue[] }`.
- Output validation failure → `ZodSerializationException` → HTTP **500**.
- `z` is re-exported from `nestjs-endpoints`, so `import { endpoint, z } from
  'nestjs-endpoints'` is the idiomatic single import. Importing `zod` directly
  works too.

Nested-object query params (`?add[a]=1&add[b]=2`) need the adapter configured
for extended query parsing — see the NestJS
[query-parameters docs](https://docs.nestjs.com/controllers#query-parameters).

### 3.3 What the handler receives

One object, with exactly these keys:

| Key | Present when | Value |
| --- | --- | --- |
| `input` | `input` declared | Parsed output of the input schema. |
| `rawInput` | `input` declared | The unvalidated body/query, before parsing. |
| `params` | `params` declared | Parsed path params. |
| `schemas` | always | `{ input?, params? }` — the Zod schemas themselves. |
| `response` | always | `response(status, body)` — required for multi-status output. |
| *(your keys)* | — | Everything from `inject` and `injectOnRequest`, by the name you gave it. |

### 3.4 Multi-status output

When `output` is a `Record<number, schema>`, the handler **must** return
`response(status, body)`; the status you pass is type-checked against the map,
and the body against that status's schema.

```ts
import { UseGuards } from '@nestjs/common';
import { endpoint, schema, z } from 'nestjs-endpoints';

export default endpoint({
  method: 'post',
  summary: 'Create an appointment',
  input: z.object({ userId: z.number(), date: z.coerce.date() }),
  output: {
    201: schema(
      z.object({ id: z.number(), address: z.string() }),
      { description: 'Appointment created' },
    ),
    400: z.union([
      z.string(),
      z.object({ message: z.string(), errorCode: z.string() }),
    ]),
  },
  decorators: [UseGuards(AuthGuard)],
  handler: async ({ input, response }) => {
    if (await hasConflict(input.date)) {
      return response(400, {
        message: 'Appointment has conflict',
        errorCode: 'APPOINTMENT_CONFLICT',
      });
    }
    return response(201, await create(input));
  },
});
```

`schema(zodSchema, { description })` attaches an OpenAPI description to one
status. It is accepted anywhere a schema is (`input`, `params`, `output`), but
the description only surfaces for `output`.

With a **single** `output` schema you just return the value; over HTTP
`response(200, ...)` is equivalent. Note the two differ under `invoke()`: a
handler that returns `response(200, x)` hands `invoke()` back the
`EndpointResponse` wrapper, while returning `x` directly gives it the parsed
body. Prefer the plain return for single-status endpoints.

For error paths that aren't part of the contract, throw the normal NestJS
exceptions (`NotFoundException`, `UnauthorizedException`, …) — they bypass output
validation entirely.

### 3.5 Dependency injection

Two tiers, mapping one-to-one onto vanilla NestJS:

```ts
import { Inject, Req, Session } from '@nestjs/common';
import type { Request } from 'express';
import { decorated, endpoint } from 'nestjs-endpoints';

export default endpoint({
  // Class-level ≡ constructor(private readonly db: DbService) {}
  inject: {
    db: DbService,
    // A non-class token needs `decorated<T>(...)` to carry the type.
    repo: decorated<IUserRepository>(Inject(UserRepositoryToken)),
  },
  // Per-request ≡ handler(@Req() req: Request, @Session() session: Session)
  injectOnRequest: {
    req: decorated<Request>(Req()),
    session: decorated<Session>(Session()),
  },
  handler: ({ db, repo, req, session }) => { /* … */ },
});
```

`decorated<T>(decorator)` pairs any NestJS property/parameter decorator with the
TypeScript type you want on the handler argument. Custom decorators
(`createParamDecorator`) work: `decorated<User>(CurrentUser())`.

Providers must be resolvable from the module the endpoint lands in — put them in
the owning router's `providers` (or `imports`).

### 3.6 Per-endpoint decorators

`decorators: MethodDecorator[]` is applied to the generated handler method. Use
it for one-off `UseGuards`, `UseInterceptors`, `HttpCode`, `Header`, custom
`SetMetadata`, etc. For anything that should cover a whole folder, put it on the
router instead (§5.5) — that's the whole point of router-scoped guards.

---

## 4. The two routing styles

### 4.1 File-based (idiomatic)

`export default` the endpoint; a router discovers the file and derives the URL
from its location.

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { EndpointRouterModule } from 'nestjs-endpoints';
import { HealthService } from './health.service';
import './endpoints.gen.js'; // the endpoint manifest (§5.6)

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

### 4.2 Manual (explicit paths)

Export the endpoint as a named const with an explicit `path`, then register it
like any controller.

```ts
// src/health-check.ts
export const healthCheck = endpoint({
  path: '/status/health',
  handler: () => ({ ok: true }),
});

// src/app.module.ts
@Module({ controllers: [healthCheck] })
export class AppModule {}
```

> **Always pass `path` for manually-registered endpoints.** An endpoint created
> outside a router with no `path` falls back to deriving its URL from the file's
> location **relative to `process.cwd()`** — which after compilation includes
> `dist/`, producing routes like `/dist/endpoints/user/list/user-list-no-path`
> and an SDK method named `distEndpointsUserListUserListNoPath`. This is almost
> never what you want.

Manually-created endpoints can also be handed to a router so they pick up its
`basePath`, providers, guards and namespace:

```ts
export default EndpointRouterModule.create({
  basePath: 'recipes-manual',
  providers: [RecipesRepository],
  endpoints: [createManualRecipeEndpoint],
});
```

### 4.3 Mixing

Both styles coexist in one app. A router scans its roots for file-based
endpoints *and* registers anything in `endpoints:`; plain `@Controller()`
classes elsewhere in the app keep working and still show up in the OpenAPI
document and the generated SDK.

---

## 5. The endpoint router

`EndpointRouterModule.create()` walks its root directories — as listed in the
endpoint manifest (§5.6) — auto-registers every endpoint file it finds, imports
every nested router it finds, and gives each endpoint its HTTP path.

### 5.1 Discovery rules

- **Endpoint files**: basename matching `endpoint.(ts|js|mjs|mts)` — i.e.
  `something.endpoint.ts` or exactly `endpoint.ts`. Everything else is ignored,
  so services, DTOs, guards and tests can sit right next to the endpoint they
  belong to. (Colocation is the intended style.)
- **Nested routers**: any directory containing a `router.module.(ts|js|mjs|mts)`
  is treated as a nested router at any depth. The parent imports it and **does
  not scan inside it** — that subtree belongs to the child.
- Directories whose name starts with `_` contribute nothing to the URL. Use
  `_endpoints/`, `_mutations/` etc. to group files without changing routes.
- Files are found through the endpoint manifest, not by reading directories, and
  each URL is derived from the file's own location. Keep the compiled layout
  identical to the source layout.

### 5.2 How a path is built

```
basePath  +  (directories under the matching rootDirectory)  +  leaf
```

Segment expansion, applied to every folder name and to the filename's leaf:

- Split on `.` → `$id.view` becomes two segments, `:id` and `view`.
- A `$` prefix makes it a path parameter → `$recipeId` becomes `:recipeId`.
- A leading `_` on a directory drops it entirely.
- Filename leaf: `create.endpoint.ts` → `create`. A file named exactly
  `endpoint.ts` contributes **no** leaf, so it maps to its folder's path.

Every `:param` in the resulting URL must be declared in the endpoint's `params`
schema, and every key of `params` must correspond to a `:param`.

### 5.3 `basePath` inference

| Where `create()` is called | Inferred `basePath` |
| --- | --- |
| A `router.module.*` file, top level | `/` + that file's folder name |
| A `router.module.*` file, nested under a parent router | parent's `basePath` + the child's folder relative to the matching parent root (or, if outside it, relative to the parent module's folder) |
| Anywhere else (`app.module.ts`, a feature module, …) | `'/'` |

Pass `basePath` explicitly to override; pass `''` or `'/'` to mount at the root.

```ts
// src/blog/router.module.ts — folder is `blog`, but routes mount at /articles
export default EndpointRouterModule.create({
  rootDirectory: 'endpoints',
  basePath: 'articles',
});
```

### 5.4 Nested routers and multi-root

```
src/
├── app.module.ts
└── endpoints/
    └── shop/
        ├── homepage.endpoint.ts          → /shop/homepage
        └── recipes/
            ├── router.module.ts          ← owns this subtree
            ├── repository.service.ts
            ├── endpoint.ts               → /shop/recipes
            └── create.endpoint.ts        → /shop/recipes/create
```

```ts
// src/endpoints/shop/recipes/router.module.ts
import { EndpointRouterModule } from 'nestjs-endpoints';
import { RecipesRepository } from './repository.service';

export default EndpointRouterModule.create({
  providers: [RecipesRepository],
  description: 'Recipe catalog and authoring.',
});
```

`rootDirectory` also takes an array; each entry is scanned independently under
the same `basePath`:

```ts
// src/shop/router.module.ts  → basePath inferred as `/shop`
export default EndpointRouterModule.create({
  // `endpoints/` holds this router's own endpoint files; the other three each
  // contain a router.module.ts and are picked up as nested routers.
  rootDirectory: ['endpoints', 'category', 'cart', 'recipes'],
  providers: [ShopService],
});
```

A router can also live inside a regular `@Module` when you need normal NestJS
wiring around it:

```ts
@Module({
  providers: [AuthService],
  exports: [AuthService],
  imports: [
    EndpointRouterModule.create({ basePath: 'auth', providers: [AuthService] }),
  ],
})
export class AuthModule {}
```

### 5.5 Middleware, interceptors, guards

All three apply to **every endpoint in the router's subtree**, nested routers
included. Module-scoped interceptors and guards are the main thing this library
adds over vanilla NestJS, where your only options are global (`APP_GUARD`) or
per-controller.

```ts
import { IncomingMessage, ServerResponse } from 'node:http';
import { EndpointRouterModule } from 'nestjs-endpoints';

export default EndpointRouterModule.create({
  providers: [RecipesGuard],
  middleware: [
    RecipesMiddleware,                                    // class-based
    (_req: IncomingMessage, _res: ServerResponse, next: () => void) => {
      next();
    },                                                    // functional
    { exclude: ['list'] },                                // options — LAST entry only
  ],
  interceptors: [RecipesInterceptor],
  guards: [RecipesGuard],
});
```

- The options object must be the **last** array entry or `create()` throws.
- `exclude` paths are resolved against the router's `basePath`
  (`'list'` under `/recipes` excludes `/recipes/list`).
- Guards/interceptors passed as classes must be resolvable — add them to
  `providers` on the same router (or an imported module).

### 5.6 The endpoint manifest

`src/endpoints.gen.ts` lists every endpoint and router-module file under `src/`
as a lazy `() => import('./…')`. Routers find and load files through it, so the
loads happen in app code: Vitest transforms them (no `server.deps.inline`
needed) and `node --watch` / `tsx watch` restart when it changes.

- **Never edit it by hand, and commit it.** It is generated.
- **Import it once**, anywhere in the app's import graph — the app module is the
  natural place. Order does not matter, and importing it loads no endpoints.
- **Generate it before the app starts.** A process can only load the files
  its manifest listed when it started, so scripts that start the app run
  `nestjs-endpoints generate` first:
  `"test": "nestjs-endpoints generate && vitest run"`, and the same in front
  of the dev server and codegen scripts. It writes only when the
  contents change, so it never restarts a watcher for nothing.
- **The app checks it too.** In development (`NODE_ENV` unset or
  `development`) the app rewrites it at startup and on every add / delete /
  rename of an endpoint or router-module file while running; a watcher then
  restarts the app with the new route set. Test runs rewrite it at startup
  only, and when endpoint files were added that run fails with "Run the tests
  again" (it loaded the old list). With `CI` set, an out-of-date manifest fails startup. With
  `NODE_ENV=production` it is used as is.
- **A new endpoint added while the app runs is served after a restart.** Under
  a watcher that is automatic; without one, restart the app.
- **Deleted endpoints never fail startup** — entries whose file is gone are
  skipped.
- Regenerate on demand: `npx nestjs-endpoints generate` (`--dir <dir>` for a
  source directory other than `src/`; `--import-extension ts` once for Node's
  native type stripping, which needs `.ts` specifiers).
- Compiled apps (`nest start --watch` runs `dist/`) find the source manifest
  through the emitted source map; keep `sourceMap` on.

---

## 6. OpenAPI

### 6.1 `setupOpenAPI`

Use this when you only want the spec (or want to drive your own generator).

```ts
import { NestFactory } from '@nestjs/core';
import { setupOpenAPI } from 'nestjs-endpoints';

const app = await NestFactory.create(AppModule);
const { document, changed } = await setupOpenAPI(app, {
  configure: (builder) => builder.setTitle('My API'),
  outputFile: process.cwd() + '/openapi.json',   // string path or a Writable
  ui: { path: 'docs' },                          // optional viewer
});
if (changed) {
  // the file on disk differed and was rewritten
}
await app.listen(3000);
```

- `configure` receives `@nestjs/swagger`'s `DocumentBuilder`.
- `outputFile` accepts a path (relative paths resolve against the calling file)
  or a `Writable` stream. `changed` is `true` only when the content differed.
- `ui: { path, options? }` mounts a viewer. If `@scalar/api-reference` is
  installed it's used (nicer UI, sidebar groups); otherwise Swagger UI. `options`
  is forwarded to whichever one is active.

### 6.2 Tags and grouping

Every operation gets one automatic tag:

- the router's namespace chain joined with `/` (e.g. `shop/recipes`), or
- if no namespace is declared, the URL prefix minus the leaf, with `:param`
  segments dropped (e.g. `/recipes/1/view` → `recipes`).

`tags: [...]` on an endpoint adds to that. A router's `description` becomes the
OpenAPI tag description for its group. When two or more distinct top-level
groups exist, an `x-tagGroups` extension is emitted so Scalar/ReDoc render
sidebar headers.

### 6.3 Schema naming

Component schemas are named from the operation: `UserCreateOutput`, and
`UserCreate400Output` for non-200 statuses. A request body gets `UserCreateInput`.
A GET endpoint's `input` becomes inline query parameters rather than a component
schema, so there is no `…Input` for it — the generated client types it as
`GreetQueryParams`.

### 6.4 `.transform()` in output schemas

A `.transform()` produces a type zod-openapi often can't infer. Either use
`.overwrite()` (same-type transforms) or annotate the result:

```ts
z.string().overwrite((s) => s.toUpperCase());

z.date()
  .transform((d) => d.toISOString())
  .meta({ type: 'string', format: 'date-time' });
```

---

## 7. Namespaces

A namespace decides where an operation lands **in the generated SDK object**. It
has **no effect on URLs**.

```ts
// src/endpoints/shop/router.module.ts
export default EndpointRouterModule.create({ namespace: true });

// src/endpoints/shop/recipes/router.module.ts
export default EndpointRouterModule.create({ namespace: true });
```

```ts
await client.shop.recipes.create({ body: { name: 'Pizza' } }); // axios
const create = client.shop.recipes.useCreate();                // react-query
```

`namespace` accepts:

| Value | Meaning |
| --- | --- |
| omitted / `false` | Contributes nothing; endpoints inherit the parent's chain. |
| `true` | Mirrors `basePath`: the explicit `basePath` value if set, else the router's folder name — the folder-name fallback only applies when `create()` is called from a `router.module.*` file, so `true` from an `app.module.ts` with no `basePath` contributes nothing. |
| `string` | That exact segment. |

A folder with **no** `router.module.ts` contributes to the URL but not to the
namespace chain — `shop/catering/book.endpoint.ts` under a namespaced `shop`
router serves `/shop/catering/book` and lands at `client.shop.useCateringBook()`.

### 7.1 How SDK names are derived

1. The operation id is the PascalCase form of the URL with `:param` segments
   removed: `/shop/recipes/edit/:recipeId` → `ShopRecipesEdit`.
2. The axios method is that, lower-cased first letter; the hook is `use` +
   PascalCase.
3. The namespace chain's PascalCase prefix is stripped before the name is placed
   in its bucket: `shopRecipesEdit` in bucket `shop.recipes` becomes `edit`.

Consequences worth knowing:

- **Path params vanish from the name** — the typed `path` group conveys them:
  `client.recipesEdit({ path: { recipeId }, body: { name } })`.
- **Stripping is lenient.** If the flat name doesn't start with the full chain,
  or stripping would leave nothing, the full flat name is kept. A bare
  `endpoint.ts` inside `shop/recipes/` produces operation `ShopRecipes`, whose
  entire name *is* the chain — so it lands at `client.shop.recipes.shopRecipes`.
  **Give such files a real leaf name** (`list.endpoint.ts`) instead.
- `axios` is reserved at the root of the client object.
- Collisions are **fatal at codegen time** with an explicit message: two
  operations resolving to the same bucket key, an operation colliding with a
  nested bucket name, or a namespace segment colliding with `axios`. Fix by
  renaming the endpoint file or the router namespace.

---

## 8. Codegen

### 8.1 `setupCodegen`

```ts
import { NestFactory } from '@nestjs/core';
import { setupCodegen } from 'nestjs-endpoints';

const app = await NestFactory.create(AppModule);
await setupCodegen(app, {
  openapi: {
    outputFile: process.cwd() + '/openapi.json',
    configure: (b) => b.setTitle('Shop API'),
    ui: { path: 'docs' },
  },
  clients: [
    { type: 'axios', outputFile: process.cwd() + '/generated/axios-client.ts' },
    {
      type: 'react-query',
      outputFile: process.cwd() + '/generated/react-query-client.tsx',
    },
  ],
});
await app.listen(3000);
```

`openapi` takes the same options as `setupOpenAPI`. Kubb is the engine; the
react-query client needs `@tanstack/react-query` >= 5.82 in the consuming app,
plus `axios` and `react`.

Per-client options:

| Option | Notes |
| --- | --- |
| `type` | `'axios'` or `'react-query'`. |
| `outputFile` | **Must include an extension** (`.ts` / `.tsx`) — the generated tree goes in a sibling directory named after it, so an extensionless path would collide. |
| `namespaces` | `string[]` restricting the client to those top-level namespaces. Omit for full access; `[]` is rejected. |
| `options` | react-query only: forwarded to `@kubb/plugin-react-query` (query keys, suspense/infinite generation, …). The `client` and `hooks` fields are managed for you. |

`forceGenerate: true` (top level) wipes and regenerates everything this call
owns. Otherwise a client regenerates when the OpenAPI document changed, or when
its wrapper file or sibling directory is missing.

### 8.2 What gets written

```
generated/
├── axios-client.ts            ← the ONLY file you import
└── axios-client/              ← Kubb output; treat as build artifact
    ├── client-runtime.ts
    ├── clients/…
    └── types/…
```

For react-query, the sibling directory also holds `hooks/`.
**Import only from the top-level wrapper file.** The sibling tree is internal,
is wiped and rewritten on every regeneration, and its per-operation hooks are
unbound (they have no client).

The wrapper exports:

| Export | axios | react-query |
| --- | --- | --- |
| `createApiClient(config?)` | ✔ | ✔ |
| `ApiClient` type | ✔ | ✔ |
| `useApiClient()` | — | ✔ |
| `ApiClientProvider` | — | ✔ |
| operation types (`UserCreateInput`, …) | ✔ | ✔ |

### 8.3 Per-client namespace filtering

One server, several clients, each shipping only what it needs (types are pruned
to match):

```ts
clients: [
  { type: 'axios', outputFile: cwd + '/generated/backend.ts' },
  {
    type: 'react-query',
    outputFile: cwd + '/generated/admin-client.tsx',
    namespaces: ['auth', 'admin'],
  },
  {
    type: 'react-query',
    outputFile: cwd + '/generated/shop-client.tsx',
    namespaces: ['auth', 'shop'],
  },
]
```

Note that filtering keeps only operations that **have** a namespace — un-namespaced
operations are excluded from a filtered client.

### 8.4 Running codegen

Codegen runs during bootstrap, so it needs the app to be created. Two common
setups:

- Call `setupCodegen` in `main.ts` before `app.listen(...)` — regenerates on
  every dev restart.
- Keep a dedicated `src/codegen.ts` that creates the app, calls `setupCodegen`,
  and exits — run it as a build/CI step so the server itself stays lean.

---

## 9. Using the generated client

### 9.1 axios

```ts
import { createApiClient } from './generated/axios-client';

const client = createApiClient({ baseURL: process.env.API_BASE_URL });
// …or hand it an axios instance you already built:
// const client = createApiClient(myAxiosInstance);

// The underlying instance is always reachable:
client.axios.defaults.headers.common['x-tenant'] = 't1';

const { data: user } = await client.user.create({
  body: { name: 'Tom', email: 'tom@x.com' },
});
```

Methods resolve to the full `AxiosResponse` and **reject on non-2xx**, exactly
like axios — so error handling is `try/catch` + `err.response.status`. Pass
`throwOnError: false` to get the error response back instead. `headers` carries
only the endpoint's declared headers; set any others on `client.axios`.

### 9.2 react-query

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiClientProvider, createApiClient } from './generated/react-query-client';

export function App() {
  const queryClient = useMemo(() => new QueryClient(), []);
  const apiClient = useMemo(
    () => createApiClient({ baseURL: import.meta.env.VITE_API_BASE_URL }),
    [],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <Routes />
      </ApiClientProvider>
    </QueryClientProvider>
  );
}
```

```tsx
import { useApiClient } from './generated/react-query-client';

function Recipes() {
  const client = useApiClient();

  const list = client.shop.recipes.useList();
  const create = client.shop.recipes.useCreate();
  const edit = client.shop.recipes.useEdit();

  const rename = async (recipeId: number, name: string) => {
    await edit.mutateAsync({ path: { recipeId }, body: { name } });
    await list.refetch();
  };

  // The imperative axios method sits on the same bucket:
  const purge = () => client.shop.recipes.purge();

  return <ul>{list.data?.map((r) => <li key={r.id}>{r.name}</li>)}</ul>;
}
```

Notes:

- Hooks return **unwrapped data** (`list.data` is the payload). The axios methods
  on the same bucket return the full `AxiosResponse`.
- Pass React Query options through the trailing argument:
  `client.useGreet({ query: { name } }, { query: { enabled: !!name, retry: false } })`.
- Errors are typed as `ResponseErrorConfig<Error>` — read
  `error.response?.data`.
- `useApiClient()` must be called under `<ApiClientProvider>`; it throws
  otherwise. The object it returns is memoized per context value.
- Suspense and infinite variants (opt in through `options`) are generated into
  the internal tree but are **not** exposed on the client object. Don't import
  them directly.

#### Query options, mutation options and the input schema

Each operation's axios method also carries what TanStack Query and a form need,
bound to the client instance it came from (its base URL and interceptors):

| Property | On | What it is |
| --- | --- | --- |
| `queryKey(req)` | query operations (`query.methods`, `GET` by default) | The key the query is cached under. |
| `queryOptions(req, config?)` | query operations | Options for `useQuery`, `queryClient.ensureQueryData`, `prefetchQuery`, … No React context needed. |
| `mutationKey()` | every other operation | The mutation's key. |
| `mutationOptions(config?)` | every other operation | Options for `useMutation`. |
| `schemas.input` | operations that take input | The input as JSON Schema, every `$ref` resolved. |

Use `queryOptions` where hooks can't run, such as a route loader. Give it the
same instance you put in `<ApiClientProvider>`:

```ts
import { api } from './api'; // export const api = createApiClient({ … })

export const loader = ({ context }: { context: { queryClient: QueryClient } }) =>
  context.queryClient.ensureQueryData(
    api.user.find.queryOptions({ query: { id: 1 } }),
  );
```

```tsx
const client = useApiClient();
const queryClient = useQueryClient();
const create = useMutation({
  ...client.user.create.mutationOptions(),
  onSuccess: () =>
    queryClient.invalidateQueries({
      queryKey: client.user.find.queryKey({ query: { id: 1 } }),
    }),
});
create.mutate({ body: { name: 'Tom', email: 'tom@x.com' } });
```

`schemas.input` is what the endpoint declares as `input`: its JSON body, or for
a `GET` its query parameters as one object. Path parameters and headers are not
input; an operation without input has no `schemas`. It is plain JSON data, so
it is in your bundle, a few KB per operation. Its type, `InputSchema<T>`
(exported by the client), carries the request body or query type in an optional
`'~type'` property that is never there at runtime, so a form library can infer
the form's values from the schema alone. That type is the input side of the
zod schema: a field with a default, or a `.nullish()` one, may be left out.

---

## 10. Testing

### 10.1 e2e over HTTP (supertest)

```ts
const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
const app = moduleFixture.createNestApplication();
await app.init();

await request(app.getHttpServer())
  .get('/user/find?id=1')
  .expect(200)
  .then((res) => expect(res.body).toMatchObject({ id: 1 }));
```

### 10.2 e2e through the generated client

Needs a real listener, so `await app.listen(0)` and read `app.getUrl()`:

```ts
const app = moduleFixture.createNestApplication();
await app.init();
await app.listen(0);
const client = createApiClient({ baseURL: await app.getUrl() });

await expect(client.userFind({ query: { id: 1 } })).resolves.toMatchObject({
  data: { id: 1, email: 'john@hotmail.com' },
});
```

### 10.3 Integration — call the handler directly with `invoke`

Every endpoint class exposes `invoke`, which runs the same validation pipeline
(input, params, output) without HTTP:

```ts
import userFindEndpoint from 'src/endpoints/user/find.endpoint';
import recipesEditEndpoint from 'src/endpoints/recipes/edit/$recipeId.endpoint';

const moduleFixture = await Test.createTestingModule({
  controllers: [userFindEndpoint, recipesEditEndpoint],
  providers: [DbService, RecipesRepository],
}).compile();
const app = moduleFixture.createNestApplication();
await app.init();

const userFind = app.get(userFindEndpoint);
await expect(userFind.invoke({ id: 1 })).resolves.toMatchObject({ id: 1 });

// Path params go in the second argument. Raw strings are coerced, exactly
// as they would be over HTTP.
const recipesEdit = app.get(recipesEditEndpoint);
await recipesEdit.invoke({ name: 'Margherita' }, { params: { recipeId: '1' } });
```

Signatures:

| Endpoint | Call |
| --- | --- |
| no `input`, no `params` | `invoke()` |
| `input` only | `invoke(rawInput)` |
| `params` only | `invoke({ params })` |
| both | `invoke(rawInput, { params })` |

Validation failures throw `ZodValidationException`; `.getZodError()` gives you
the `ZodError`. `invoke` returns the **validated body** for a single-status
endpoint, and an `EndpointResponse { status, body }` for a multi-status one.

### 10.4 One router without the app module

Import the manifest alongside the router (or list it in Vitest's
`setupFiles`). It loads nothing by itself, so only that router's subtree loads:

```ts
import '../src/endpoints.gen';
import ShopRouterModule from '../src/shop/router.module';

const moduleFixture = await Test.createTestingModule({
  imports: [ShopRouterModule],
}).compile();
```

---

## 11. Exports

```ts
import {
  endpoint,            // create an endpoint (returns a controller class)
  decorated,           // pair a NestJS decorator with a TS type
  schema,              // attach an OpenAPI description to a Zod schema
  EndpointResponse,    // what `response(status, body)` returns
  EndpointRouterModule,
  setupOpenAPI,
  setupCodegen,
  ZodValidationException,    // 400 — input/params failed
  ZodSerializationException, // 500 — output failed
  ApiQueries,          // helper decorators, rarely needed directly
  ApiParams,
  registerEndpointManifest, // called by the generated endpoints.gen.ts only
  z,                   // re-export of zod
} from 'nestjs-endpoints';
```

---

## 12. Recipes

**Add an endpoint to an existing file-based router.** Create
`<router-root>/<segments>/<name>.endpoint.ts`, `export default endpoint({...})`,
declare `input`/`output`, add any provider it needs to the nearest
`router.module.ts`'s `providers`. Nothing else to register: the endpoint
manifest picks the file up when the app's scripts next run
`nestjs-endpoints generate`, or a running dev server sees it (or run
`npx nestjs-endpoints generate` yourself); commit the updated
`src/endpoints.gen.ts`.
Regenerate the client if one exists.

**Add a path parameter.** Rename the file/folder to use `$name`
(`edit/$recipeId.endpoint.ts`), add `params: z.object({ recipeId: z.coerce.number() })`,
and read `params.recipeId` in the handler.

**Carve out a subtree with its own providers/guards.** Drop a `router.module.ts`
into the folder with `export default EndpointRouterModule.create({ providers, guards })`.
The parent picks it up automatically; the `basePath` is inferred from the folder
name.

**Group files without changing URLs.** Prefix the folder with `_`.

**Change a route without moving files.** Set `basePath` on the router, or `path`
on the endpoint.

**Reshape the client SDK.** Add `namespace: true` (or a string) to the routers
whose folders should become buckets. URLs are unaffected.

**Add a second, narrower front-end client.** Add another entry to
`setupCodegen`'s `clients` with `namespaces: [...]`.

---

## 13. Troubleshooting

| Symptom | Cause |
| --- | --- |
| Route 404s | Endpoint file isn't named `*.endpoint.ts` / `endpoint.ts`, or it sits under a folder owned by a nested `router.module.ts` you didn't expect, or it isn't `export default`ed. |
| Route mounted at `/dist/...` or `/src/...` | Manually-registered endpoint with no `path` (§4.2). |
| 400 "Validation failed" on a GET | Query values arrive as strings — use `z.coerce.*`. |
| 500 on a response that looks right | Output schema mismatch (`ZodSerializationException`). |
| `Did not find schema for status code N` | `response(N, ...)` used with a status absent from the `output` map. |
| Handler returns a value but nothing validates | Multi-status `output` requires `response(status, body)`. |
| OpenAPI response type is `{}` or wrong | A `.transform()` in the output schema — use `.overwrite()` or `.meta({ type })`. |
| `Two operations resolve to the same wrapper property` | Namespace/endpoint name collision — rename one (§7.1). |
| SDK method keeps its full flat name inside its bucket (`client.shop.recipes.shopRecipes`) | A bare `endpoint.ts` whose path equals its namespace chain, so stripping would leave nothing — give the file a leaf name. |
| `middleware options object must be the last entry` | The `{ exclude }` object isn't last in the `middleware` array. |
| `useApiClient must be used within an <ApiClientProvider>` | Missing provider above the component. |
| Nothing regenerates after an endpoint change | The OpenAPI doc didn't change, or codegen isn't running — use `forceGenerate: true`. |
| Routes disappear in production | The build bundles the app; file-based routing needs real files on disk. |
| `no endpoint manifest covers "<dir>"` | `src/endpoints.gen.ts` is missing or not imported. Run `npx nestjs-endpoints init`, then import it from the app module — or, in a test that imports a router module directly, from the test or Vitest `setupFiles` (§10.4). |
| `endpoints.gen.ts is out of date` (CI) | Endpoint files were added/removed without the manifest being regenerated. Run `npx nestjs-endpoints generate` and commit it. |
| `endpoints.gen.ts was out of date and has been regenerated … Run the tests again` | A test run found endpoint files the manifest didn't list. It has been rewritten; re-run (Vitest's watch mode does so on its own). Run `nestjs-endpoints generate` in front of the test script to avoid it. |
| A new endpoint 404s until restart | Expected without a watcher: the manifest was updated, the running process predates the file. Restart, or run under `node --watch` / `tsx watch`. If the file existed before the app started, the start script is missing `nestjs-endpoints generate &&`. |
| `Cannot find the source of …endpoints.gen.js (no source map?)` | A compiled app without source maps can't locate the manifest to keep it in sync. Enable `sourceMap`, or run `npx nestjs-endpoints generate` after changing endpoint files. |
