import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';

export async function createApp(moduleFixture: TestingModule) {
  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  app.set('query parser', 'extended');
  await app.init();
  // supertest connects to 127.0.0.1. Listening on the default `::` lets
  // macOS hand out a port another process holds on 127.0.0.1, and the
  // request then reaches that process (a 501, a socket hang up).
  await app.listen(0, '127.0.0.1');
  return { app, httpAdapter: 'express' };
}
