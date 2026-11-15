import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';

export async function createApp(
  moduleFixture: TestingModule,
  options: {
    // For what must be registered before the adapter starts serving, such as
    // the routes `setupOpenAPI()` mounts for its docs UI.
    beforeInit?: (app: NestExpressApplication) => Promise<void>;
  } = {},
) {
  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  app.set('query parser', 'extended');
  await options.beforeInit?.(app);
  await app.init();
  // supertest connects to 127.0.0.1. Listening on the default `::` lets
  // macOS hand out a port another process holds on 127.0.0.1, and the
  // request then reaches that process (a 501, a socket hang up).
  await app.listen(0, '127.0.0.1');
  return { app, httpAdapter: 'express' };
}
