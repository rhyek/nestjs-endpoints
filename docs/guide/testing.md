---
description: Test endpoints over HTTP, through the generated client, by invoking one under its routers, or in isolation with only the providers it needs.
---

# Testing

<Endpoint>Endpoints</Endpoint> are NestJS controllers, so they are tested with `@nestjs/testing`
like the rest of a Nest app. You can test at four levels, from the whole app down to one handler.

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
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  const { body } = await request(app.getHttpServer())
    .post('/orders/create')
    .send({ productId: 'sku_42', quantity: 2 })
    .expect(200);
  expect(body).toMatchObject({ id: 1, status: 'pending' });
});
```

Replace a provider with NestJS's own testing API:

```ts
const moduleRef = await Test.createTestingModule({
  imports: [AppModule],
})
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
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  await app.listen(0);

  const client = createApiClient({ baseURL: await app.getUrl() });

  await expect(
    client.orders.create({
      body: { productId: 'sku_42', quantity: 2 },
    }),
  ).resolves.toMatchObject({
    status: 200,
    data: { id: 1, status: 'pending' },
  });
});
```

## Invoking an endpoint directly {#invoke}

Every endpoint has an [`invoke()`](../reference/endpoint.md#invoke) method, which calls its
handler without HTTP. It validates `params`, `query`, `input` and `output` as a request would,
and runs nothing else: no middleware, guards, interceptors, pipes or exception filters, the
routers' or the endpoint's own. Values from `injectOnRequest` come from a request, so they are
`undefined`: test a handler that needs one over HTTP.

Take an API whose `teams` folder has three levels of routers, each made with its parent's
[`child()`](./router-context.md#child-routers):

::: code-group

```ts [teams/router.ts]
export default EndpointRouter.create({
  imports: [DbModule],
  context: { inject: { db: DbService } },
});
```

```ts [teams/$teamId/router.ts]
import teamsRouter from '../router.js';

export default teamsRouter.child({
  context: { params: z.object({ teamId: z.uuid() }) },
});
```

```ts [teams/$teamId/members/router.ts]
import teamRouter from '../router.js';

export default teamRouter.child({
  providers: [Mailer],
  context: { inject: { mailer: Mailer } },
});
```

:::

And an endpoint under the grandchild:

```ts
// src/endpoints/teams/$teamId/members/invite.endpoint.ts
import membersRouter from './router.js';

export default membersRouter.endpoint.mutation({
  input: z.object({ email: z.email() }),
  handler: async ({ params, input, db, mailer }) => {
    const [member] = await db
      .insert(members)
      .values({ teamId: params.teamId, email: input.email })
      .returning();
    await mailer.sendInvite(input.email);
    return member;
  },
});
```

Import the router of the endpoint's folder, the grandchild here, and nothing else. It brings
what the routers above it give: the `teams` router's `DbModule` and `db`, and the `$teamId`
router's `teamId`. Get the endpoint's instance from the app and invoke it:

```ts
import { Test } from '@nestjs/testing';
import inviteEndpoint from '../src/endpoints/teams/$teamId/members/invite.endpoint.js';
import membersRouter from '../src/endpoints/teams/$teamId/members/router.js';

test('invites a member', async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [membersRouter],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  const member = await app.get(inviteEndpoint).invoke({
    params: { teamId: '0b9e2c4a-6f1d-4e8b-9a3c-5d7f1e2b8c60' },
    input: { email: 'ada@example.com' },
  });
  expect(member).toMatchObject({ email: 'ada@example.com' });
});
```

- **Only that router's folder is loaded**: its endpoints and the routers under it, and none of
  the endpoints of the routers above it. It answers HTTP requests too, at the URLs it has in the
  whole app, with the middleware, guards and interceptors of every router above it.
- **A router made with [`EndpointRouter.create()`](./routers.md#nested-routers) inherits
  nothing**, so a test of one gives it nothing from the routers above it either.
- **Replace a provider** with NestJS's `.overrideProvider()`, as in any test.

## Testing an endpoint in isolation {#isolation}

For larger applications, leave the routers out, and load the endpoint as a controller, so a
test starts only what that endpoint needs. Nothing reaches it on its own: the testing module
provides everything the endpoint and its routers inject, here what the `teams` and `members`
routers gave it in the test above:

```ts
import { Test } from '@nestjs/testing';
import { DbModule } from '../src/db/db.module.js';
import inviteEndpoint from '../src/endpoints/teams/$teamId/members/invite.endpoint.js';
import { Mailer } from '../src/mail/mailer.js';

test('invites a member, and mails them', async () => {
  const mailer = { sendInvite: vi.fn() };
  const moduleRef = await Test.createTestingModule({
    controllers: [inviteEndpoint],
    imports: [DbModule],
    providers: [{ provide: Mailer, useValue: mailer }],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  await app.get(inviteEndpoint).invoke({
    params: { teamId: '0b9e2c4a-6f1d-4e8b-9a3c-5d7f1e2b8c60' },
    input: { email: 'ada@example.com' },
  });
  expect(mailer.sendInvite).toHaveBeenCalledWith(
    'ada@example.com',
  );
});
```

The endpoint keeps the `params` of its routers, so `invoke()` still validates the `teamId` the
`$teamId` router declares. A provider left out fails the test as the app starts, naming it.
