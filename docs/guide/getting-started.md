---
description: Install nestjs-endpoints in a NestJS app, write a first endpoint and call it.
---

# Getting started

nestjs-endpoints lets you write each HTTP endpoint of a NestJS app as one file: Zod schemas for
what comes in and what goes out, and a handler. Each endpoint is a regular NestJS controller
underneath, so the rest of the app stays as it is.

From those schemas you get validation and, if you want one, a
[typed client](../clients/codegen.md) for your front end.

## Requirements

- **Node.js 24.22 or later**
- **NestJS 12 or later**
- **TypeScript 6 or later**
- **Zod 4.1 or later**
- **An ESM project**, with `"type": "module"` in its `package.json`. CommonJS is not supported.
- **Run with the Nest CLI** (`nest start`). Node with a TypeScript loader, such as SWC's
  (`@swc-node/register`) or oxc's (`@oxc-node/core`), works too; with `node --watch`, set
  `watch: true` in [`NestjsEndpoints.forRoot`](../reference/router.md#nestjsendpoints-forroot)
  so that a new endpoint file restarts the app.

## Install

::: code-group

```bash [npm]
npm install nestjs-endpoints zod
```

```bash [pnpm]
pnpm add nestjs-endpoints zod
```

```bash [yarn]
yarn add nestjs-endpoints zod
```

:::

## Set up the app module

`NestjsEndpoints.forRoot` sets the library up, once, in your app's root module. Its `router` is
the app's root [router](./routers.md), which finds the endpoint files under a folder and
registers them:

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { NestjsEndpoints } from 'nestjs-endpoints';
import { OrdersService } from './endpoints/orders/orders.service.js';

@Module({
  imports: [
    NestjsEndpoints.forRoot({
      router: { rootDirectory: './endpoints', providers: [OrdersService] },
    }),
  ],
})
export class AppModule {}
```

`rootDirectory` is relative to the file that calls `forRoot()`. The router takes `providers`,
`imports` and `exports` as any Nest module does.

## Set up Vitest

A new Nest project tests with Vitest. Add `nestjs-endpoints` to `server.deps.inline` in both of
its configs, `vitest.config.ts` and `vitest.config.e2e.ts`, so that the endpoint files the
package loads go through Vite like the rest of your code:

```ts
// vitest.config.e2e.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    server: { deps: { inline: ['nestjs-endpoints'] } }, // [!code ++]
  },
});
```

See [Testing](./testing.md) for how to test endpoints.

## Write an endpoint

An endpoint file is named `<name>.endpoint.ts` and default-exports its endpoint:

```ts twoslash
// @filename: src/endpoints/orders/create.sample.ts
// ---cut---
// src/endpoints/orders/create.endpoint.ts
import { endpoint, z } from 'nestjs-endpoints';
import { OrdersService } from './orders.service';

export default endpoint.mutation({
  input: z.object({
    productId: z.string(),
    quantity: z.number().int().min(1),
    notes: z.string().optional(),
  }),
  output: z.object({
    id: z.number(),
    status: z.enum(['pending', 'paid', 'cancelled']),
    total: z.number(),
  }),
  inject: { orders: OrdersService },
  handler: ({ input, orders }) => orders.create(input),
});
```

Hover over `input` or `orders` in the handler: both are typed, from the schema and from the
provider's class.

- The file's path under `rootDirectory` is the route: `POST /orders/create`. See
  [File-based routing](./file-based-routing.md).
- `input` is the JSON body. An endpoint is a `POST` unless it [sets `method`](./endpoints.md#http-method).
- `endpoint.mutation()` is for writes and `endpoint.query()` for reads. They serve the same way;
  the choice decides which hooks the [React Query client](../clients/react-query.md) generates.
- `inject` names the providers the handler needs. See [Dependency injection](./dependency-injection.md).

## Call it

Start the app:

```bash
npx nest start --watch
```

The router finds the endpoint files when the app starts. An endpoint file you add later is served
after a restart, which `nest start --watch` does by itself.

Then send a request:

```bash
$ curl -X POST localhost:3000/orders/create \
    -H 'Content-Type: application/json' \
    -d '{"productId": "sku_42", "quantity": 2}'
{"id":1,"status":"pending","total":25}
```

A body that doesn't match `input` is answered with a `400` and the Zod issues, before the handler
runs:

```bash
$ curl -X POST localhost:3000/orders/create \
    -H 'Content-Type: application/json' \
    -d '{"productId": "sku_42", "quantity": "two"}'
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "expected": "number",
      "code": "invalid_type",
      "path": ["quantity"],
      "message": "Invalid input: expected number, received string"
    }
  ]
}
```

## A complete example

The [`examples/file-based-routing`](https://github.com/rhyek/nestjs-endpoints/tree/main/examples/file-based-routing)
folder in the repository is a small working project: a NestJS API with nested routers and
namespaces, and a React front end that calls it through the generated React Query client.

## Next steps

- [Why nestjs-endpoints](./why.md): what it replaces, and what it asks of you.
- [How it fits NestJS](./nestjs.md): what an endpoint is to the rest of a Nest app.
- [Writing an endpoint](./endpoints.md): `input`, `query`, `params`, `output` and the handler.
- [Type safety](./type-safety.md): what the compiler checks for you.
- [Generating clients](../clients/codegen.md): a typed axios or React Query client.
