import { Test, TestingModule } from '@nestjs/testing';
import Axios from 'axios';
import { createApiClient } from '../generated/axios-client';
import { AppModule } from '../src/app.module';
import { createApp } from './create-app';

describe('generated client', () => {
  test.concurrent('create user - axios config', async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const { app } = await createApp(moduleFixture);
    try {
      const client = createApiClient({
        baseURL: await app.getUrl(),
      });
      await expect(
        client.userGet({ body: { id: 1 } }),
      ).rejects.toMatchObject({
        response: {
          status: 404,
          data: {
            statusCode: 404,
            message: 'User not found',
          },
        },
      });
      const {
        data: { id },
      } = await client.userCreate({
        body: { name: 'Jake', email: 'jake@gmail.com' },
      });
      const { data: user } = await client.userFind({ body: { id } });
      expect(user).toEqual({
        id,
        name: 'Jake',
        email: 'jake@gmail.com',
      });
    } finally {
      await app.close();
    }
  });

  test.concurrent('create user - axios instance', async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(0, '127.0.0.1');
    try {
      const axios = Axios.create({
        baseURL: await app.getUrl(),
      });
      const client = createApiClient(axios);
      await expect(
        client.userGet({ body: { id: 1 } }),
      ).rejects.toMatchObject({
        response: {
          status: 404,
          data: {
            statusCode: 404,
            message: 'User not found',
          },
        },
      });
      const {
        data: { id },
      } = await client.userCreate({
        body: { name: 'Jake', email: 'jake@gmail.com' },
      });
      const { data: user } = await client.userFind({ body: { id } });
      expect(user).toEqual({
        id,
        name: 'Jake',
        email: 'jake@gmail.com',
      });
    } finally {
      await app.close();
    }
  });

  test.concurrent('greet endpoint via axios client', async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const { app } = await createApp(moduleFixture);
    try {
      const client = createApiClient({
        baseURL: await app.getUrl(),
      });
      const { data } = await client.greet({ body: { name: 'Alice' } });
      expect(data).toBe('Hello, Alice!');
    } finally {
      await app.close();
    }
  });

  test.concurrent(
    'namespaced axios api — reaches un-namespaced + nested operations',
    async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      const { app } = await createApp(moduleFixture);
      try {
        const client = createApiClient({
          baseURL: await app.getUrl(),
        });
        // Un-namespaced operation (no router namespace) sits at the root
        // of the client using its flat camelCase name.
        const greet = await client.greet({ body: { name: 'Clara' } });
        expect(greet.data).toBe('Hello, Clara!');
        // One-level namespace bucket (from `namespace: 'articles'`).
        const latest = await client.articles.latest();
        expect(latest.data).toMatchObject({ title: expect.any(String) });
        // Two-level nested namespace bucket (shop → cart, from two routers
        // both declaring `namespace: true`).
        const cart = await client.shop.cart.add({
          body: { item: 'apple' },
        });
        expect(cart.data).toMatchObject({ added: 'apple' });
      } finally {
        await app.close();
      }
    },
  );

  test.concurrent(
    'path params: typed signatures + multi-param via $-segment routing',
    async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      const { app } = await createApp(moduleFixture);
      try {
        const client = createApiClient({
          baseURL: await app.getUrl(),
        });
        // Seed a recipe so we have something to address by id.
        const { data: created } = await client.recipesCreate({
          body: { name: 'Pizza' },
        });
        expect(created).toEqual({ id: 1, name: 'Pizza' });

        // PATCH /recipes/edit/:recipeId — :param drops out of the
        // method name; the path param moves to the `path` group.
        const { data: edited } = await client.recipesEdit({
          path: { recipeId: created.id },
          body: { name: 'Margherita' },
        });
        expect(edited).toEqual({ id: 1, name: 'Margherita' });

        // POST /recipes/:recipeId/view
        const { data: viewed } = await client.recipesView({
          path: { recipeId: created.id },
        });
        expect(viewed).toMatchObject({ id: 1, name: 'Margherita' });

        // DELETE /recipes/:recipeId/delete
        const { data: removed } = await client.recipesDelete({
          path: { recipeId: created.id },
        });
        expect(removed).toEqual({ id: 1, name: 'Margherita' });

        // Multi-param: POST /restaurant/:restaurantId/recipes/:recipeId/view
        const { data: multi } = await client.restaurantRecipesView({
          path: { restaurantId: 7, recipeId: 42 },
        });
        expect(multi).toEqual({ restaurantId: 7, recipeId: 42 });
      } finally {
        await app.close();
      }
    },
  );

  test.concurrent(
    'axios wrapper exposes .axios — interceptors observe requests to namespaced methods',
    async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      const { app } = await createApp(moduleFixture);
      try {
        const underlying = Axios.create({
          baseURL: await app.getUrl(),
        });
        const client = createApiClient(underlying);
        // .axios must be the exact instance the wrapper is bound to —
        // mutations made on it (defaults, interceptors) apply to every
        // subsequent call, namespaced or flat.
        expect(client.axios).toBe(underlying);

        const seenUrls: string[] = [];
        client.axios.interceptors.request.use((config) => {
          if (config.url) seenUrls.push(config.url);
          return config;
        });

        const cart = await client.shop.cart.add({
          body: { item: 'apple' },
        });
        expect(cart.data).toMatchObject({ added: 'apple' });
        expect(seenUrls).toContain('/shop/cart/add');
      } finally {
        await app.close();
      }
    },
  );

  test.concurrent(
    'throwOnError: false resolves with the error response',
    async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      const { app } = await createApp(moduleFixture);
      try {
        const client = createApiClient({ baseURL: await app.getUrl() });
        await expect(
          client.userGet({ body: { id: 1 }, throwOnError: false }),
        ).resolves.toMatchObject({
          status: 404,
          data: { message: 'User not found' },
        });
      } finally {
        await app.close();
      }
    },
  );

  test.concurrent(
    'method with all-optional params is callable with no arguments',
    async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      const { app } = await createApp(moduleFixture);
      try {
        const client = createApiClient({ baseURL: await app.getUrl() });
        // Called with NO arguments — the bound client must still be injected
        // into the omitted options object.
        await expect(client.optionalParams()).resolves.toMatchObject({
          data: { ok: true, q: null },
        });
        // And still works when the optional params are provided.
        await expect(
          client.optionalParams({ query: { q: 'hi' } }),
        ).resolves.toMatchObject({ data: { ok: true, q: 'hi' } });
      } finally {
        await app.close();
      }
    },
  );

  test.concurrent(
    'search params travel in `query` on a GET, beside `body` on a POST',
    async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      const { app } = await createApp(moduleFixture);
      try {
        const client = createApiClient({ baseURL: await app.getUrl() });
        // GET /oauth/callback?code=...&state=...&expiresIn=...
        const { data: callback } = await client.oauthCallback({
          query: { code: 'abc', state: 'xyz', expiresIn: 3600 },
        });
        expect(callback).toEqual({
          code: 'abc',
          state: 'xyz',
          expiresIn: 3600,
        });

        // POST /search?page=2 with a JSON body.
        const { data: found } = await client.search({
          query: { page: 2 },
          body: { term: 'pizza', tags: ['vegan'] },
        });
        expect(found).toEqual({ term: 'pizza', tags: ['vegan'], page: 2 });
      } finally {
        await app.close();
      }
    },
  );
});
