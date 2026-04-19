import { Writable } from 'node:stream';
import { Test, TestingModule } from '@nestjs/testing';
import { setupOpenAPI } from 'nestjs-endpoints';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from './create-app';

describe('multi-root + folder-inferred basePath', () => {
  async function setup() {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const { app } = await createApp(moduleFixture);
    app.useLogger(false);
    return { app, req: request(app.getHttpServer()) };
  }

  test('parent router: own endpoints mount under folder-inferred basePath', async () => {
    const { app, req } = await setup();
    try {
      await req.get('/shop/stats').expect(200, { visitors: 42 });
      await req.get('/shop/promo/today').expect(200, { code: 'TODAY10' });
    } finally {
      await app.close();
    }
  });

  test('sibling dir with its own router.module.ts is treated as a nested router', async () => {
    const { app, req } = await setup();
    try {
      await req
        .get('/shop/category/list')
        .expect(200, [{ id: 1, name: 'books' }]);
      await req
        .get('/shop/cart/add')
        .query({ item: 'ABC' })
        .expect(200, { added: 'ABC' });
    } finally {
      await app.close();
    }
  });

  test('nested router module with endpoint.ts + create.endpoint.ts', async () => {
    // `shop/recipes/` is a nested router. Inside it:
    //   - `endpoint.ts`         → /shop/recipes       (folder path, no leaf)
    //   - `create.endpoint.ts`  → /shop/recipes/create
    const { app, req } = await setup();
    try {
      await req.get('/shop/recipes').expect(200, []);
      await req
        .get('/shop/recipes/create')
        .query({ name: 'Pizza' })
        .expect(200, { id: 1, name: 'Pizza' });
      await req
        .get('/shop/recipes')
        .expect(200, [{ id: 1, name: 'Pizza' }]);
    } finally {
      await app.close();
    }
  });

  test('explicit basePath overrides folder-name inference', async () => {
    const { app, req } = await setup();
    try {
      // Folder is 'blog' but basePath: 'articles' is explicit.
      await req.get('/articles/latest').expect(200, { title: 'Hello' });
      await req.get('/blog/latest').expect(404);
    } finally {
      await app.close();
    }
  });

  test('single-string rootDirectory keeps working (regression)', async () => {
    // The top-level AppModule still uses rootDirectory: './endpoints'
    // (a single string). Sanity-check that endpoints under there still
    // resolve correctly.
    const { app, req } = await setup();
    try {
      await req
        .get('/greet')
        .query({ name: 'Jo' })
        .expect(200, 'Hello, Jo!');
      await req
        .post('/user/create')
        .send({ name: 'X', email: 'x@y.com' })
        .expect(200, { id: 1 });
    } finally {
      await app.close();
    }
  });

  test('OpenAPI spec contains the multi-segment paths', async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleFixture.createNestApplication();
    app.useLogger(false);
    await app.init();
    try {
      let spec = '';
      const stream = new Writable({
        write(chunk, _, callback) {
          spec += chunk.toString();
          callback();
        },
      });
      await setupOpenAPI(app, {
        configure: (b) => b.setTitle('multi-root'),
        outputFile: stream,
      });
      const parsed = JSON.parse(spec);
      expect(parsed.paths).toHaveProperty('/shop/stats');
      expect(parsed.paths).toHaveProperty('/shop/promo/today');
      expect(parsed.paths).toHaveProperty('/shop/category/list');
      expect(parsed.paths).toHaveProperty('/shop/cart/add');
      expect(parsed.paths).toHaveProperty('/shop/recipes');
      expect(parsed.paths).toHaveProperty('/shop/recipes/create');
      expect(parsed.paths).toHaveProperty('/articles/latest');
      expect(parsed.paths).not.toHaveProperty('/blog/latest');
    } finally {
      await app.close();
    }
  });
});
