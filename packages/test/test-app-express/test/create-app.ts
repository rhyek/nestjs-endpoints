import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';

export async function createApp(moduleFixture: TestingModule) {
  const app =
    moduleFixture.createNestApplication<NestExpressApplication>();
  app.set('query parser', 'extended');
  await app.init();
  await app.listen(0);
  return { app, httpAdapter: 'express' };
}
