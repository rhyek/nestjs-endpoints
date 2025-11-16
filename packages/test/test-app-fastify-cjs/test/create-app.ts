import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import type { TestingModule } from '@nestjs/testing';

export async function createApp(moduleFixture: TestingModule) {
  const app = moduleFixture.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );
  await app.init();
  await app.listen(0);
  await app.getHttpAdapter().getInstance().ready();
  return { app, httpAdapter: 'fastify' };
}
