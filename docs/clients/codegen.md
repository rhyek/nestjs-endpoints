---
description: Generate a typed axios or React Query client from your endpoints' Zod schemas with setupCodegen.
---

# Generating clients

`setupCodegen` writes a typed client for your API, generated from each endpoint's Zod schemas:
an [axios](./axios.md) client, a [React Query](./react-query.md) client, or several of either.

```ts twoslash
// @noErrors
import { createApiClient } from './generated/axios-client.js';
// ---cut---
const client = createApiClient({ baseURL: 'https://api.example.com' });

const { data: order } = await client.orders.
//                                          ^|




```

## Requirements

- **`axios` 1.20 or later**, wherever a client is used.
- **`@tanstack/react-query` 5.82 or later** and `react`, for the React Query client.
- **The `dom` lib.** The generated code type-checks with it, so a Node-only project that
  compiles a client adds it to its tsconfig: `"lib": ["esnext", "dom"]`.

## Set it up

Call `setupCodegen` where the app is created, before it listens:

```ts
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { setupCodegen } from 'nestjs-endpoints';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  await setupCodegen(app, {
    clients: [
      {
        type: 'axios',
        outputFile: process.cwd() + '/generated/axios-client.ts',
      },
      {
        type: 'react-query',
        outputFile: process.cwd() + '/../web/src/generated/react-query-client.tsx',
      },
    ],
  });

  await app.listen(3000);
}
void bootstrap();
```

Each entry of `clients` writes one client:

| Option | |
| --- | --- |
| `type` | `'axios'` or `'react-query'`. |
| `outputFile` | Where to write the client. It must have an extension, `.ts` or `.tsx`. |
| `namespaces` | Limit the client to these top-level [namespaces](./namespaces.md#a-client-per-front-end). Leave it out for every operation. |
| `options` | React Query only: options for [`@kubb/plugin-react-query`](https://kubb.dev/extensions/kubb-labs/plugin-react-query/options), such as query keys. |

`forceGenerate: true`, beside `clients`, regenerates every client on each run.

`setupCodegen` only generates clients. An app that never calls it has all its endpoints, routers
and OpenAPI metadata.

## What is written

```
generated/
├── axios-client.ts     ← the file you import
└── axios-client/       ← generated code behind it
```

Each client is its `outputFile` and a folder of the same name beside it. **Import only from the
file.** The folder is rewritten on every regeneration. Commit both, or ignore both.

The file exports:

| Export | axios | React Query |
| --- | --- | --- |
| `createApiClient(config?)` | ✓ | ✓ |
| `ApiClient`, the client's type | ✓ | ✓ |
| `useApiClient()`, `ApiClientProvider` | | ✓ |
| `ResponseError`, `isResponseError()` | ✓ | ✓ |
| `InputSchema`, the type of an operation's [input schemas](./react-query.md#input-schemas) | | ✓ |
| Each operation's types: `OrdersCreateInput`, `OrdersCreateOutput`, … | ✓ | ✓ |

## When a client is regenerated

A client is rewritten only when what it is generated from changes, such as an endpoint's
schema or the client's own options. A restart that changes no schema changes no client.

## Where to run it

Codegen runs while the app starts, so it needs the app to be created. Two setups are common.

### In `main.ts`

Call `setupCodegen` before `app.listen()`, as in [Set it up](#set-it-up). The client is
regenerated on every restart of the dev server, so the front end follows the API as you edit it.

### In a script of its own

A script such as `src/codegen.ts` creates the app without starting the server, writes the
clients, and closes the app. Run it as a build or CI step, so the server itself does no codegen:

```ts
// src/codegen.ts
import { NestFactory } from '@nestjs/core';
import { setupCodegen } from 'nestjs-endpoints';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await setupCodegen(app, {
    clients: [{ type: 'axios', outputFile: process.cwd() + '/generated/axios-client.ts' }],
  });
  await app.close();
}
void bootstrap();
```

`nest build` compiles it with the rest of `src/`, so a script in `package.json` builds and runs it:

```jsonc
// package.json
{
  "scripts": {
    "codegen": "nest build && node dist/codegen"
  }
}
```

## Calling an operation

Each operation takes one object that groups its request by where it goes:

| In the endpoint | In the call |
| --- | --- |
| `params` | `path` |
| `query` | `query` |
| `input` | `body` |

```ts
await client.orders.list({ query: { page: 2 }, body: { status: 'pending' } });
await client.orders.view({ path: { orderId: 1 } });
```

An operation's name comes from the endpoint's URL and its router's namespace. See
[Namespaces](./namespaces.md#how-names-are-derived).

## What a client covers

The clients are generated from endpoints, so they cover endpoints only. Routes of plain
`@Controller()` classes are not in a client: call them through the client's axios instance,
`client.axios`, or [run a generator of your own](./openapi.md#your-own-generator) against an
OpenAPI document.
