---
description: Generate a typed axios or React Query client from your endpoints' Zod schemas - declare the clients in NestjsEndpoints.forRoot, and write them as the app starts or with a command.
---

# Generating clients

nestjs-endpoints writes a typed client for your API, generated from each endpoint's Zod schemas:
an [axios](./axios.md) client, a [React Query](./react-query.md) client, or several of either.
You declare them once, in `NestjsEndpoints.forRoot`.

```ts twoslash
// @noErrors
import { createApiClient } from './generated/axios-client.js';
// ---cut---
const client = createApiClient({
  baseURL: 'https://api.example.com',
});

const { data: order } = await client.orders.
//                                          ^|




```

## Requirements

- **`axios` 1.20 or later**, wherever a client is used.
- **`@tanstack/react-query` 5.82 or later** and `react`, for the React Query client.
- **The `dom` lib.** The generated code type-checks with it, so a Node-only project that
  compiles a client adds it to its tsconfig: `"lib": ["esnext", "dom"]`.

## Set it up

List the clients in `clients`, beside the app's root router:

```ts
// src/app.module.ts
import path from 'node:path';
import { Module } from '@nestjs/common';
import { NestjsEndpoints } from 'nestjs-endpoints';

@Module({
  imports: [
    NestjsEndpoints.forRoot({
      router: { rootDirectory: './endpoints' },
      clients: () => {
        const dir = import.meta.dirname;
        return [
          {
            type: 'axios',
            outputFile: path.join(
              dir,
              '../generated/axios-client.ts',
            ),
          },
          {
            type: 'react-query',
            outputFile: path.join(
              dir,
              '../../web/src/api-client.tsx',
            ),
          },
        ];
      },
    }),
  ],
})
export class AppModule {}
```

`clients` is a list, or a function that returns one. Each entry writes one client:

| Option | |
| --- | --- |
| `type` | `'axios'` or `'react-query'`. |
| `outputFile` | Where to write the client: a `.ts` or `.tsx` file. |
| `namespaces` | Limit the client to these top-level [namespaces](./namespaces.md#a-client-per-front-end). Leave it out for every operation. |
| `options` | React Query only: options for [`@kubb/plugin-react-query`](https://kubb.dev/extensions/kubb-labs/plugin-react-query/options), such as query keys. |

## When they are written

**As the app starts, in development.** The app writes its clients once its modules have
initialized and before it listens. A client is rewritten only when what it is generated from
changed, such as an endpoint's schema or the client's own options, so under a dev server that
[restarts on change](../guide/development.md), saving an endpoint file updates the client.

`generateClientsOnStart` decides where. By default it is on when `NODE_ENV` is `development` or
not set, as under `nest start --watch`, and off for any other value, as under a test runner or
in production.

**With a command.** [`nestjs-endpoints generate`](#the-command) writes them without starting the
app.

## What is written

```
generated/
├── axios-client.ts     ← the file you import
└── axios-client/       ← generated code behind it
```

Each client is its `outputFile` and a folder of the same name beside it. **Import only from the
file.** Commit both, or ignore both. Generating a client again rewrites only the files
that changed.

The file exports:

| Export | axios | React Query |
| --- | --- | --- |
| `createApiClient(config?)` | ✓ | ✓ |
| `ApiClient`, the client's type | ✓ | ✓ |
| `useApiClient()`, `ApiClientProvider` | | ✓ |
| `ResponseError`, `isResponseError()` | ✓ | ✓ |
| `InputSchema`, the type of an operation's [input schemas](./react-query.md#input-schemas) | | ✓ |
| Each operation's types: `OrdersCreateInput`, `OrdersCreateOutput`, … | ✓ | ✓ |

## The command

`nestjs-endpoints generate` writes every client the app declares without starting the app: no
provider is made, no lifecycle hook runs, and nothing listens. Use it as a build or CI step, or
when the dev server is not running.

Give it the file that exports the app's root module, as the app runs it:

::: code-group

```bash [Nest CLI]
nest build && nestjs-endpoints generate dist/app.module.js
```

```bash [A TypeScript loader]
nestjs-endpoints generate src/app.module.ts \
  --import @oxc-node/core/register
```

:::

- **The module** is the file's default export, or else its export named `AppModule`, or else the
  only module it exports.
- **`--import`** names a module for Node to import first, as Node's own `--import` does: the
  loader a TypeScript file needs.

### A global prefix or versioning

A global prefix and URI versioning are part of every URL, and so of every client. The clients an
app writes as it starts have them, but the command reads the app module, not `main.ts`, and
does not see what `main.ts` sets. An app that sets either writes its clients without starting
from a script of its own, which sets them too:

```ts
// src/codegen.ts
import { NestFactory } from '@nestjs/core';
import { setupCodegen } from 'nestjs-endpoints';
import { AppModule } from './app.module.js';

const app = await NestFactory.create(AppModule, {
  preview: true,
});
app.setGlobalPrefix('api');
await setupCodegen(app, { forceGenerate: true });
```

```jsonc
// package.json
{
  "scripts": {
    "codegen": "nest build && node dist/codegen"
  }
}
```

`preview: true` is NestJS's own mode that builds the app's modules without making their
providers. `setupCodegen(app)` writes the clients the app declares in `forRoot`, and
`forceGenerate` has it write those that are up to date as well.

## Calling an operation

Each operation takes one object that groups its request by where it goes:

| In the endpoint | In the call |
| --- | --- |
| `params` | `path` |
| `query` | `query` |
| `input` | `body` |

```ts
await client.orders.list({
  query: { page: 2 },
  body: { status: 'pending' },
});
await client.orders.view({ path: { orderId: 1 } });
```

An operation's name comes from the endpoint's URL and its router's
[namespace](./namespaces.md#how-names-are-derived).

## What a client covers

The clients are generated from endpoints, so they cover <Endpoint>endpoints</Endpoint> only. Routes
of plain `@Controller()` classes are not in a client: call them through the client's axios instance,
`client.axios`, or [run a generator of your own](./openapi.md#your-own-generator) against an OpenAPI
document.
