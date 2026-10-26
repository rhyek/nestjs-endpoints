import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
// Registering the manifest loads nothing: it only tells routers where their
// files are. Only the router imported below loads, with its own subtree.
import '../src/endpoints.gen';
import ShopRouterModule from '../src/shop/router.module';
import { createApp } from './create-app';

test('a single router module can be tested without the rest of the app', async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [ShopRouterModule],
  }).compile();
  const { app } = await createApp(moduleFixture);
  app.useLogger(false);
  const req = request(app.getHttpServer());
  try {
    await req.post('/shop/stats').expect(200, { visitors: 42 });
    await req.post('/shop/cart/add').send({ item: 'ABC' }).expect(200, { added: 'ABC' });
    await req.post('/user/find').expect(404);
    await req.post('/articles/latest').expect(404);
  } finally {
    await app.close();
  }
});
