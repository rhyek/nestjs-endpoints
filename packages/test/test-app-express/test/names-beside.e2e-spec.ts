import { INestApplication, LoggerService, NestApplicationOptions } from '@nestjs/common';
import request from 'supertest';
import { LegacyModule } from '../src/names/legacy.controller';
import namesRouter from '../src/names/router';
import { appWith, namesFirst } from './app-with';

// `names/` has `list`, the parameter `$slug`, the router `$id` (its endpoints `view` and
// `list`), the router `extra` (its parameter `$item`), and, beside them, a controller at
// `names/legacy`.

/** Every warning an app logs. */
function warnings() {
  const logged: string[] = [];
  const logger: LoggerService = {
    log() {},
    error() {},
    warn(message: unknown) {
      logged.push(String(message));
    },
  };
  return { logged, logger };
}

const started = (
  configure?: (app: INestApplication) => void,
  options: NestApplicationOptions = namesFirst,
) => appWith([namesRouter, LegacyModule], { configure, options });

const requests: [what: string, url: string, status: number, body: string | undefined][] = [
  ['a name', '/names/list', 200, 'list'],
  ['a value of a parameter', '/names/abc', 200, 'slug abc'],
  ['the name of a controller beside the parameter', '/names/legacy', 201, 'legacy'],
  ['the name of a router beside the parameter', '/names/extra', 404, undefined],
  ["a value of a router's parameter", '/names/abc/view', 200, 'view abc'],
  [
    "a value of a router's parameter, named as an endpoint beside it",
    '/names/list/view',
    404,
    undefined,
  ],
  [
    "a value of a router's parameter, named as a controller beside it",
    '/names/legacy/view',
    404,
    undefined,
  ],
  // On the side of `extra`: `list` under the parameter `$id` is no name beside `$item`.
  [
    'a parameter under a name, for a value named as a route elsewhere',
    '/names/extra/list',
    200,
    'item list',
  ],
  ['a parameter under a name', '/names/extra/view', 200, 'item view'],
  ["a router's route under its parameter", '/names/abc/list', 200, 'list abc'],
];

describe('a path parameter does not take a name beside it as a value', () => {
  let app: INestApplication;
  beforeAll(async () => {
    ({ app } = await started());
  });
  afterAll(async () => {
    await app?.close();
  });

  test.each(requests)('for %s, %s', async (_, url, status, body) => {
    const response = await request(app.getHttpServer()).post(url).expect(status);
    if (body !== undefined) {
      expect(response.text).toBe(body);
    }
  });

  test('a controller beside it whose getter reads what it injects starts with the app, and serves', async () => {
    await request(app.getHttpServer()).post('/names/legacy').expect(201, 'legacy');
  });

  test('a value named as a route beside it is a URL no route answers', async () => {
    const nothing = await request(app.getHttpServer()).post('/names/a/b/c').expect(404);
    for (const url of ['/names/list/view', '/names/extra', '/names/legacy/view']) {
      const refused = await request(app.getHttpServer()).post(url).expect(404);
      expect(refused.body).toEqual({
        ...nothing.body,
        message: String(nothing.body.message).replace('/names/a/b/c', url),
      });
    }
  });

  test("a value named as a route beside it runs none of the endpoint's routers' guards", async () => {
    const answered = await request(app.getHttpServer()).post('/names/abc/view').expect(200);
    expect(answered.headers['x-guarded']).toBe('id');
    const refused = await request(app.getHttpServer()).post('/names/list/view').expect(404);
    expect(refused.headers['x-guarded']).toBeUndefined();
  });

  test("a value named as a route beside it runs none of the parameter's routers' middleware", async () => {
    const answered = await request(app.getHttpServer()).post('/names/abc/view').expect(200);
    expect(answered.headers['x-ran']).toBe('names,id');
    const refused = await request(app.getHttpServer()).post('/names/list/view').expect(404);
    expect(refused.headers['x-ran']).toBe('names');
    const extra = await request(app.getHttpServer()).post('/names/extra/list').expect(200);
    expect(extra.headers['x-ran']).toBe('names,extra');
  });

  test('a value is a name of another case only for a router that ignores case', async () => {
    const caseSensitive = app.getHttpAdapter().getRouteMatchingOptions?.()?.caseSensitive ?? true;
    const response = await request(app.getHttpServer()).post('/names/LIST/view');
    if (caseSensitive) {
      expect(response.status).toBe(200);
      expect(response.text).toBe('view LIST');
    } else {
      expect(response.status).toBe(404);
    }
  });

  test('a value that is a name only once decoded is still the name', async () => {
    await request(app.getHttpServer()).post('/names/l%69st/view').expect(404);
  });
});

describe('the same, in an app with a prefix for all of its URLs', () => {
  let app: INestApplication;
  beforeAll(async () => {
    ({ app } = await started((nest) => nest.setGlobalPrefix('api')));
  });
  afterAll(async () => {
    await app?.close();
  });

  test.each(requests)('for %s, %s', async (_, url, status, body) => {
    const response = await request(app.getHttpServer()).post(`/api${url}`).expect(status);
    if (body !== undefined) {
      expect(response.text).toBe(body);
    }
  });
});

describe('the warning to register names before parameters, where a parameter has names beside it', () => {
  test('is logged as an app starts on an adapter that answers a URL with the first route registered that matches it, and only there', async () => {
    const { logged, logger } = warnings();
    const { app, httpAdapter } = await started(undefined, { logger });
    try {
      const warned = logged.filter((message) => message.includes('nestjs-endpoints'));
      if (httpAdapter === 'express') {
        expect(warned).toEqual([expect.stringContaining("routeResolutionStrategy: 'specificity'")]);
        expect(warned[0]).toContain('/names/:slug');
      } else {
        expect(warned).toEqual([]);
      }
    } finally {
      await app.close();
    }
  });

  test('is not logged for an app that registers names first', async () => {
    const { logged, logger } = warnings();
    const { app } = await started(undefined, { logger, ...namesFirst });
    try {
      expect(logged.filter((message) => message.includes('nestjs-endpoints'))).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
