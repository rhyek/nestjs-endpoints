---
description: What nestjs-endpoints replaces in a NestJS app, what it leaves alone, and what it asks of you.
---

# Why nestjs-endpoints

In a NestJS app a route is described several times: in decorators, in DTOs or schemas, in
parameter and return types, and again in the front end. Each copy can drift from the others.

nestjs-endpoints has you describe a route once, in one file, and derives the rest.

## The same route, twice

Here is a route that creates an order, as a NestJS controller that validates with Zod. It
relies on NestJS's `StandardSchemaValidationPipe` being bound globally, in `main.ts`:

```ts twoslash
// @filename: src/orders/orders.sample.ts
import { OrdersService } from '../endpoints/orders/orders.service';
// ---cut---
import {
  Body,
  Controller,
  HttpCode,
  Post,
  SerializeOptions,
  StandardSchemaSerializerInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { z } from 'zod';

const createOrderInput = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1),
  notes: z.string().optional(),
});

const createOrderOutput = z.object({
  id: z.number(),
  status: z.enum(['pending', 'paid', 'cancelled']),
  total: z.number(),
});

@Controller('orders')
@UseInterceptors(StandardSchemaSerializerInterceptor)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('create')
  @HttpCode(200)
  @SerializeOptions({ schema: createOrderOutput })
  create(
    @Body({ schema: createOrderInput })
    input: z.output<typeof createOrderInput>,
  ) {
    return this.orders.create(input);
  }
}
```

And as an endpoint:

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

Both serve `POST /orders/create`, validate the body, and validate the response. The differences
are in what you leave out, and in what the compiler can check:

| | Controller | Endpoint |
| --- | --- | --- |
| The route's path | In `@Controller()` and `@Post()` | The file's path |
| The handler's parameter types | Written beside each schema | Inferred from the schemas |
| The return value | Validated when the request runs | Also checked by the compiler, against `output` |
| Registering it | Listed in a module's `controllers` | Found by the router |
| A client for the front end | Yours to generate | Generated from the same schemas |

## What you get

- **One file per endpoint**: its schemas, its handler and what it injects. This is the
  [REPR pattern](https://www.apitemplatepack.com/docs/introduction/repr-pattern/).
- **[Types from the schemas](./type-safety.md)**, in the handler and in the client.
- **Validation in both directions**: requests before the handler runs, responses before they
  are sent.
- **[File-based routing](./file-based-routing.md)**: a file's path is its URL.
- **[Routers](./routers.md)** that give a folder its own providers, middleware, interceptors and
  guards, [which NestJS has no way to do](./improvements.md).
- **[Faster validation](./performance.md)** than NestJS's own: about 25% more requests per
  second where a request and its response are both validated.
- **A [typed client](../clients/codegen.md)** for axios or React Query, generated from the same
  schemas.

It leaves NestJS alone. An endpoint is a controller class, so modules, providers, guards,
interceptors, exception filters and the testing module work as they do in any Nest app, and
endpoints live beside your existing controllers. See [How it fits NestJS](./nestjs.md).

## What it asks of you

It is opinionated in a few places, and they are worth knowing before you start:

- **Endpoints are `POST`s with a JSON body, unless you say otherwise.** The API reads as a set of
  operations (`/orders/create`, `/orders/list`) more than as REST resources. An endpoint that
  needs another method [sets `method`](./endpoints.md#http-method).
- **Zod is the schema library.** Zod 4.1 or later.
- **ESM only.** The project needs `"type": "module"`.
- **File-based routing needs the files on disk.** A build that bundles the app into one file
  (Webpack, `nest build --webpack`) is [not supported](./file-based-routing.md#builds).

## Where the ideas come from

nestjs-endpoints is inspired by [FastEndpoints](https://fast-endpoints.com/) for .NET, by
[tRPC](https://trpc.io/), and by the file-based routing of
[TanStack Router](https://tanstack.com/router).
