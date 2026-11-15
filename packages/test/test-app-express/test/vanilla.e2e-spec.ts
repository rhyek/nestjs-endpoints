import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from './create-app';

// What a plain Nest controller's `null` comes out as, unlike an endpoint's,
// which is the JSON `null` on every adapter: Express and the Node adapter end
// the response with no body (supertest reads `{}`); Fastify sends `null`.
function nullResponseBody(httpAdapter: string) {
  return httpAdapter === 'fastify' ? null : {};
}

describe('vanilla controller', { concurrent: true }, () => {
  async function setup() {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    return createApp(moduleFixture);
  }
  test('get null', async () => {
    const { app, httpAdapter } = await setup();
    const req = request(app.getHttpServer());
    try {
      await req.get('/vanilla/null').expect(200, nullResponseBody(httpAdapter));
    } finally {
      await app.close();
    }
  });
  test('post null', async () => {
    const { app, httpAdapter } = await setup();
    const req = request(app.getHttpServer());
    try {
      await req.post('/vanilla/null').expect(201, nullResponseBody(httpAdapter));
    } finally {
      await app.close();
    }
  });
});
