import request from 'supertest';
// Only the router imported below loads, with its own subtree.
import ShopRouterModule from '../src/shop/router.module';
import { appWith } from './app-with';

test('a single router can be tested without the rest of the app', async () => {
  const { app } = await appWith([ShopRouterModule]);
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
