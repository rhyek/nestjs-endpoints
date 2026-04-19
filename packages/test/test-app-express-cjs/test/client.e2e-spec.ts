import { Test, TestingModule } from '@nestjs/testing';
import Axios from 'axios';
import { api } from '../generated/axios-client';
import { AppModule } from '../src/app.module';
import { createApp } from './create-app';

describe('generated client', () => {
  test.concurrent('create user - axios config', async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const { app } = await createApp(moduleFixture);
    try {
      const client = api.createAxiosClient({
        baseURL: await app.getUrl(),
      });
      await expect(client.userGet({ id: 1 })).rejects.toMatchObject({
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
        name: 'Jake',
        email: 'jake@gmail.com',
      });
      const { data: user } = await client.userFind({ id });
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
    await app.listen(0);
    try {
      const axios = Axios.create({
        baseURL: await app.getUrl(),
      });
      const client = api.createAxiosClient(axios);
      await expect(client.userGet({ id: 1 })).rejects.toMatchObject({
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
        name: 'Jake',
        email: 'jake@gmail.com',
      });
      const { data: user } = await client.userFind({ id });
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
      const client = api.createAxiosClient({
        baseURL: await app.getUrl(),
      });
      const { data } = await client.greet({ name: 'Alice' });
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
        const client = api.createAxiosClient({
          baseURL: await app.getUrl(),
        });
        // Un-namespaced operation (no router namespace) sits at the root
        // of the client using its flat camelCase name.
        const greet = await client.greet({ name: 'Clara' });
        expect(greet.data).toBe('Hello, Clara!');
        // One-level namespace bucket (from `namespace: 'articles'`).
        const latest = await client.articles.latest();
        expect(latest.data).toMatchObject({ title: expect.any(String) });
        // Two-level nested namespace bucket (shop → cart, from two routers
        // both declaring `namespace: true`).
        const cart = await client.shop.cart.add({ item: 'apple' });
        expect(cart.data).toMatchObject({ added: 'apple' });
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
        const client = api.createAxiosClient(underlying);
        // .axios must be the exact instance the wrapper is bound to —
        // mutations made on it (defaults, interceptors) apply to every
        // subsequent call, namespaced or flat.
        expect(client.axios).toBe(underlying);

        const seenUrls: string[] = [];
        client.axios.interceptors.request.use((config) => {
          if (config.url) seenUrls.push(config.url);
          return config;
        });

        const cart = await client.shop.cart.add({ item: 'apple' });
        expect(cart.data).toMatchObject({ added: 'apple' });
        expect(seenUrls).toContain('/shop/cart/add');
      } finally {
        await app.close();
      }
    },
  );
});
