import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import idRouter from '../src/lanes/$id/router';
import extraRouter from '../src/lanes/extra/router';
import kidRouter from '../src/lanes/plain/kid/router';
import { appWith, namesFirst } from './app-with';

// No app of this file has the routers above the ones it loads: each child applies the
// middleware of those, before its own.
describe('two children of one router, in an app without it', () => {
  let app: INestApplication;
  beforeAll(async () => {
    ({ app } = await appWith([idRouter, extraRouter], { options: namesFirst }));
  });
  afterAll(async () => {
    await app?.close();
  });

  test.each([
    [
      "one's endpoint has its parent's middleware, once, before its own",
      '/lanes/abc/view',
      200,
      'lanes,id',
    ],
    ["the other's has it too, and not its sibling's", '/lanes/extra/list', 200, 'lanes,extra'],
    ['a route the parent leaves out is left out', '/lanes/abc/inner/skip', 200, 'id'],
    ["a route a child leaves out still has its parent's", '/lanes/abc/secret', 200, 'lanes'],
  ])('%s', async (_, url, status, ran) => {
    const response = await request(app.getHttpServer()).post(url).expect(status);
    expect(response.headers['x-ran']).toBe(ran);
  });

  test("the parent's own endpoints, and its other routers, are not in the app", async () => {
    await request(app.getHttpServer()).get('/lanes/count').expect(404);
    await request(app.getHttpServer()).post('/lanes/plain/kid/list').expect(404);
    // A URL of the parent's that reads as an id is the child's to answer.
    await request(app.getHttpServer()).post('/lanes/listed').expect(200, 'at listed');
  });
});

describe('a child of a router made with create(), in an app without it', () => {
  let app: INestApplication;
  beforeAll(async () => {
    ({ app } = await appWith([kidRouter], { options: namesFirst }));
  });
  afterAll(async () => {
    await app?.close();
  });

  test('is under the base path its parent has by itself, with its middleware', async () => {
    // Its parent is under `lanes` only where the lanes router finds it.
    const response = await request(app.getHttpServer()).post('/plain/kid/list').expect(200);
    expect(response.headers['x-ran']).toBe('plain,kid');
  });
});
