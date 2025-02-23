import type { TestingModule } from '@nestjs/testing';

export async function createApp(moduleFixture: TestingModule) {
  const app = moduleFixture.createNestApplication();
  await app.init();
  return app;
}
