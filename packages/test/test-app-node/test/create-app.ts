import { NestNodeApplication, NodeAdapter } from '@nestjs/platform-node';
import type { TestingModule } from '@nestjs/testing';
import qs from 'qs';

export async function createApp(moduleFixture: TestingModule) {
  const app = moduleFixture.createNestApplication<NestNodeApplication>(
    new NodeAdapter({
      querystringParser: (str) => qs.parse(str),
    }),
  );
  await app.init();
  // supertest connects to 127.0.0.1. Listening on the default `::` lets
  // macOS hand out a port another process holds on 127.0.0.1, and the
  // request then reaches that process (a 501, a socket hang up).
  await app.listen(0, '127.0.0.1');
  return { app, httpAdapter: 'node' };
}
