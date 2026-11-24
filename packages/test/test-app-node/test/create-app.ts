import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import { NestNodeApplication, NodeAdapter } from '@nestjs/platform-node';
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
  const app = moduleFixture.createNestApplication<NestNodeApplication>(
    new NodeAdapter({
      querystringParser: (str) => qs.parse(str),
    }),
    options,
  );
  configure(app);
  await app.init();
  // supertest connects to 127.0.0.1. Listening on the default `::` lets
  // macOS hand out a port another process holds on 127.0.0.1, and the
  // request then reaches that process (a 501, a socket hang up).
  await app.listen(0, '127.0.0.1');
  return { app, httpAdapter: 'node' };
}
