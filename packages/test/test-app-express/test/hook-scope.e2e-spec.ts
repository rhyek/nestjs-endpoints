import { Injectable, Module, Scope } from '@nestjs/common';
import { endpoint } from 'nestjs-endpoints';
import request from 'supertest';
import { appWith } from './app-with';

// NestJS calls lifecycle hooks only on what it makes once. An app with a router or a root
// fails as it starts; one with neither has nothing of this package to start with.
describe('an endpoint that declares a lifecycle hook and is made for each request', () => {
  test('in an app with no router and no root, fails each request for it', async () => {
    @Injectable({ scope: Scope.REQUEST })
    class PerRequest {}
    let started = 0;
    const Hooked = endpoint.query({
      path: 'hook-scope/hooked',
      inject: { perRequest: PerRequest },
      lifecycle: {
        onModuleInit() {
          started++;
        },
      },
      handler: () => 'never',
    });
    const Plain = endpoint.query({ path: 'hook-scope/plain', handler: () => 'plain' });
    @Module({ controllers: [Hooked, Plain], providers: [PerRequest] })
    class AppModule {}
    const { app } = await appWith([AppModule]);
    try {
      await request(app.getHttpServer()).post('/hook-scope/hooked').expect(500);
      await request(app.getHttpServer()).post('/hook-scope/plain').expect(200, 'plain');
      expect(started).toBe(0);
    } finally {
      await app.close();
    }
  });
});
