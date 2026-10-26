// Deliberately first: the nested router's module is evaluated here, before
// the app module and outside any router, as it is when a spec imports
// something of a nested router before the app.
import '../src/shop/category/router.module';
import { Test } from '@nestjs/testing';
import { setupOpenAPI } from 'nestjs-endpoints';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from './create-app';

test('a nested router evaluated before its parent still mounts under it', async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const { app } = await createApp(moduleFixture);
  app.useLogger(false);
  try {
    await request(app.getHttpServer()).post('/shop/category/list').expect(200);
    const { document } = await setupOpenAPI(app);
    expect(document.paths['/shop/category/list'].post).toMatchObject({
      'x-namespace': ['shop', 'category'],
    });
  } finally {
    await app.close();
  }
});
