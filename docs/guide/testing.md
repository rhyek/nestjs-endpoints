---
description: Test endpoints over HTTP, through the generated client, one router at a time, or by calling a handler directly with invoke().
---

# Testing

Endpoints are NestJS controllers, so they are tested with `@nestjs/testing` like the rest of a
Nest app. You can test at four levels, from the whole app down to one handler.

## Vitest

Add `nestjs-endpoints` to `server.deps.inline` in each of your Vitest configs. A new Nest project
has two, `vitest.config.ts` and `vitest.config.e2e.ts`; in the first, as Nest writes it:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    server: { deps: { inline: ['nestjs-endpoints'] } }, // [!code ++]
  },
});
```

Vitest runs installed packages in plain Node unless told to process them, and nestjs-endpoints
loads your endpoint files, so they must go through Vite like the rest of your code.

## Over HTTP

Compile the app module and send requests with `supertest`:

```ts
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

test('creates an order', async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  await request(app.getHttpServer())
    .post('/orders/create')
    .send({ productId: 'sku_42', quantity: 2 })
    .expect(200)
    .then((response) => {
      expect(response.body).toMatchObject({ id: 1, status: 'pending' });
    });
});
```

Replace a provider with NestJS's own testing API:

```ts
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(OrdersService)
  .useValue(fakeOrders)
  .compile();
```

## Through the generated client

Calling the app through its [generated client](../clients/axios.md) tests the client and the
server together, with typed requests and responses. The client needs a real listener, so listen
on port `0` and read the URL back:

```ts
import { createApiClient } from '../generated/axios-client.js';

test('creates an order', async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  await app.listen(0);

  const client = createApiClient({ baseURL: await app.getUrl() });

  await expect(
    client.orders.create({ body: { productId: 'sku_42', quantity: 2 } }),
  ).resolves.toMatchObject({
    status: 200,
    data: { id: 1, status: 'pending' },
  });
});
```

## Testing one router

Import a router module without the rest of the app, and only that router's folder is loaded:

```ts
import OrdersRouterModule from '../src/endpoints/orders/router.module.js';

test('orders router', async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [OrdersRouterModule],
  }).compile();
  // …
});
```

A test that imports more than one router module imports `NestjsEndpoints.forRoot()` beside them,
as the app's root module does.

## Integration tests

Load individual endpoints as controllers, with only the providers they need, and call them with
`invoke()`. It runs the endpoint without HTTP, through the same validation of `input`, `query`,
`params` and `output`:

```ts
import { Test } from '@nestjs/testing';
import createOrder from '../src/endpoints/orders/create.endpoint.js';
import viewOrder from '../src/endpoints/orders/$orderId.view.endpoint.js';
import { OrdersService } from '../src/endpoints/orders/orders.service.js';

test('creates and reads an order', async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [createOrder, viewOrder],
    providers: [OrdersService],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  const created = await app.get(createOrder).invoke({ productId: 'sku_42', quantity: 2 });
  expect(created).toMatchObject({ id: 1, status: 'pending' });

  // Path and search parameters are raw strings, coerced as they would be over HTTP.
  const viewed = await app.get(viewOrder).invoke({ params: { orderId: '1' } });
  expect(viewed.id).toBe(1);
});
```

`invoke()` takes the raw input, then the path and search parameters: see
[its forms](../reference/endpoint.md#invoke). It resolves to the validated body, [typed from `output`](./type-safety.md#tests). For an endpoint
with [several statuses](./responses.md#several-statuses) it resolves to an `EndpointResponse`,
`{ status, body }`.

An endpoint built with a router's `endpoint` builder carries the
[router's injections](./routers.md#shared-injections) into such a test. List the
providers the router's `inject` names in the testing module.
