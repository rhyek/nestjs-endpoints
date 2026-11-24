import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import type { TestingModule } from '@nestjs/testing';
import qs from 'qs';

/**
 * The app of a testing module, listening. `configure` is given the app before it starts: what
 * an app sets on itself then, such as a global prefix. `options` are those it is made with.
 */
export async function createApp(
  moduleFixture: TestingModule,
  configure: (app: INestApplication) => void = () => {},
  options?: NestApplicationOptions,
) {
  const app = moduleFixture.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({
      routerOptions: { querystringParser: (str) => qs.parse(str) },
    }),
    options,
  );
  configure(app);
  await app.init();
  await app.listen(0);
  await app.getHttpAdapter().getInstance().ready();
  return { app, httpAdapter: 'fastify' };
}
