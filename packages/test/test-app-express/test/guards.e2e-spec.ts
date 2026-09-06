import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from './create-app';

describe('guards option on EndpointsRouterModule.register', () => {
  async function setup() {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const { app } = await createApp(moduleFixture);
    app.useLogger(false);
    return { app, req: request(app.getHttpServer()) };
  }

  test('request without the required header is rejected by the guard', async () => {
    const { app, req } = await setup();
    try {
      await req.get('/secured/me').expect(403);
    } finally {
      await app.close();
    }
  });

  test('request with the required header passes the guard', async () => {
    const { app, req } = await setup();
    try {
      await req
        .get('/secured/me')
        .set('x-secret', 'let-me-in')
        .expect(200, { ok: true });
    } finally {
      await app.close();
    }
  });
});
