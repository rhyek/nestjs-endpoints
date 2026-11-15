import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import type { TestingModule } from '@nestjs/testing';
import qs from 'qs';

export async function createApp(
  moduleFixture: TestingModule,
  options: {
    // For what must be registered before the adapter starts serving, such as
    // the routes `setupOpenAPI()` mounts for its docs UI.
    beforeInit?: (app: NestFastifyApplication) => Promise<void>;
  } = {},
) {
  const app = moduleFixture.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({
      routerOptions: { querystringParser: (str) => qs.parse(str) },
    }),
  );
  await options.beforeInit?.(app);
  await app.init();
  await app.listen(0);
  await app.getHttpAdapter().getInstance().ready();
  return { app, httpAdapter: 'fastify' };
}
