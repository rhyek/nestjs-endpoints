import request from 'supertest';
import { AppModule } from '../src/app.module';
import { appWith } from './app-with';

describe('guards option on EndpointRouter.create', () => {
  async function setup() {
    const { app } = await appWith([AppModule]);
    return { app, req: request(app.getHttpServer()) };
  }

  test('request without the required header is rejected by the guard', async () => {
    const { app, req } = await setup();
    try {
      await req.post('/secured/me').expect(403);
    } finally {
      await app.close();
    }
  });

  test('request with the required header passes the guard', async () => {
    const { app, req } = await setup();
    try {
      await req.post('/secured/me').set('x-secret', 'let-me-in').expect(200, { ok: true });
    } finally {
      await app.close();
    }
  });
});
