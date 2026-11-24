import { INestApplication, VersioningType } from '@nestjs/common';
import { NestjsEndpoints } from 'nestjs-endpoints';
import request from 'supertest';
import lanesRouter from '../src/lanes/router';
import { ran } from '../src/ran.middleware';
import { appWith, namesFirst } from './app-with';

/** A request: what it is for, its method and URL, its status and the middleware that ran. */
type Sent = [
  what: string,
  method: 'post' | 'get' | 'head',
  url: string,
  status: number,
  ran: string | undefined,
];

// `lanes/` is a tree of routers whose middleware each add their name to the `x-ran` header:
// `lanes`, its children `$id` and `extra`, and `plain`, made with `create()`, with its child
// `kid`.
const requests: Sent[] = [
  ["a router's own endpoint", 'post', '/lanes/list', 200, 'lanes'],
  ['an endpoint its router lists by hand', 'post', '/lanes/listed', 200, 'lanes'],
  ['a GET endpoint', 'get', '/lanes/count', 200, 'lanes'],
  ['HEAD on a GET endpoint', 'head', '/lanes/count', 200, 'lanes'],
  ['a route its router leaves out, given with a slash', 'post', '/lanes/open', 200, undefined],
  ["an endpoint at a child router's own base path", 'post', '/lanes/abc', 200, 'lanes,id'],
  ["a child router's endpoint", 'post', '/lanes/abc/view', 200, 'lanes,id'],
  // A name beside `$id` is not an id: the URLs under it are the name's side. No endpoint
  // answers these, and `$id`'s middleware does not run for them.
  [
    "a child router's endpoint, for a value named as an endpoint beside it",
    'post',
    '/lanes/list/view',
    404,
    'lanes',
  ],
  [
    "a child router's endpoint, for a value named as a router beside it",
    'post',
    '/lanes/extra/view',
    404,
    'lanes,extra',
  ],
  [
    "a child router's own base path, for a value named as a router beside it",
    'post',
    '/lanes/extra',
    404,
    'lanes,extra',
  ],
  [
    "a child router's endpoint, for a value named as a router made with create() beside it",
    'post',
    '/lanes/plain/view',
    404,
    'lanes,plain',
  ],
  [
    "a child router's route that a router beside it has too, with a name for its parameter",
    'post',
    '/lanes/abc/list',
    200,
    'lanes,id',
  ],
  ['a route a child router leaves out', 'post', '/lanes/abc/secret', 200, 'lanes'],
  ['a route of a child that its parent leaves out', 'post', '/lanes/abc/inner/skip', 200, 'id'],
  ['a second child, in a folder with a name', 'post', '/lanes/extra/list', 200, 'lanes,extra'],
  [
    'a child of a router made with create()',
    'post',
    '/lanes/plain/kid/list',
    200,
    'lanes,plain,kid',
  ],
  [
    'a route two routers down that the top router leaves out',
    'post',
    '/lanes/plain/kid/skipped',
    200,
    'plain,kid',
  ],
  [
    'a URL under a router that has no endpoint of its own',
    'post',
    '/lanes/plain/nothing',
    404,
    'lanes,plain',
  ],
];

async function started(configure?: (app: INestApplication) => void) {
  const { app } = await appWith([lanesRouter], { configure, options: namesFirst });
  return app;
}

/**
 * A test for each request of `table`, sent to `app()` with `prefix` before its URL, and with
 * `headers`: it answers with its status, and the middleware it names ran for it.
 */
function testRan(
  app: () => INestApplication,
  table: Sent[],
  { prefix = '', headers = {}, title = 'for %s' } = {},
) {
  test.each(table)(title, async (_, method, url, status, expected) => {
    const sent = request(app().getHttpServer())[method](prefix + url);
    const response = await sent.set(headers).expect(status);
    expect(response.headers['x-ran']).toBe(expected);
  });
}

describe('the middleware that runs for a request, each once, from the outer router in', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await started();
  });
  afterAll(async () => {
    await app?.close();
  });

  testRan(() => app, requests);

  test('an endpoint beside a folder that names a path parameter is the one that answers its URL', async () => {
    // `/lanes/list` is a URL `/lanes/:id` matches too.
    await request(app.getHttpServer()).post('/lanes/list').expect(200, 'list');
    await request(app.getHttpServer()).post('/lanes/abc').expect(200, 'at abc');
  });

  test('a route a router has beside one with a parameter there is the one that answers its URL', async () => {
    await request(app.getHttpServer()).post('/lanes/extra/list').expect(200, 'extra');
    await request(app.getHttpServer()).post('/lanes/abc/list').expect(200, 'list abc');
  });
});

describe('the same, in an app with a prefix for all of its URLs', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await started((nest) => nest.setGlobalPrefix('api'));
  });
  afterAll(async () => {
    await app?.close();
  });

  testRan(() => app, requests, { prefix: '/api' });

  test('nothing runs for a URL without the prefix', async () => {
    const response = await request(app.getHttpServer()).post('/lanes/list').expect(404);
    expect(response.headers['x-ran']).toBeUndefined();
  });
});

describe('the same, in an app with versions in its URLs and a version for those that have none', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await started((nest) =>
      nest.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' }),
    );
  });
  afterAll(async () => {
    await app?.close();
  });

  testRan(() => app, requests, { prefix: '/v1' });

  testRan(
    () => app,
    [
      ['an endpoint with a version of its own', 'post', '/v2/lanes/abc/versioned', 200, 'lanes,id'],
      [
        'the same, for a value named as an endpoint beside it',
        'post',
        '/v2/lanes/list/versioned',
        404,
        'lanes',
      ],
      [
        'the same, under the version of the URLs that have none',
        'post',
        '/v1/lanes/abc/versioned',
        404,
        'lanes,id',
      ],
    ],
  );
});

describe('the same, in an app with versions in its URLs and none for those that have none', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await started((nest) => nest.enableVersioning({ type: VersioningType.URI }));
  });
  afterAll(async () => {
    await app?.close();
  });

  testRan(() => app, requests);

  testRan(
    () => app,
    [
      ['an endpoint with a version of its own', 'post', '/v2/lanes/abc/versioned', 200, 'lanes,id'],
      [
        'the same, for a value named as an endpoint beside it',
        'post',
        '/v2/lanes/list/versioned',
        404,
        'lanes',
      ],
    ],
  );
});

describe('the same, in an app that reads versions from a header', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await started((nest) =>
      nest.enableVersioning({
        type: VersioningType.HEADER,
        header: 'x-version',
      }),
    );
  });
  afterAll(async () => {
    await app?.close();
  });

  testRan(() => app, requests, { title: 'for %s, asking for no version' });

  testRan(
    () => app,
    [
      ['an endpoint with a version of its own', 'post', '/lanes/abc/versioned', 200, 'lanes,id'],
      [
        'the same, for a value named as an endpoint beside it',
        'post',
        '/lanes/list/versioned',
        404,
        'lanes',
      ],
      ['a route its router leaves out', 'post', '/lanes/open', 200, undefined],
    ],
    { headers: { 'x-version': '2' }, title: 'for %s, asking for version 2' },
  );
});

describe("an app's root router, whose base path is the root, in an app with versions in its URLs", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const root = NestjsEndpoints.forRoot({
      router: { rootDirectory: '../src/rooted', middleware: [ran('root')] },
    });
    ({ app } = await appWith([root], {
      configure: (nest) =>
        nest.enableVersioning({
          type: VersioningType.URI,
          defaultVersion: '1',
        }),
      options: namesFirst,
    }));
  });
  afterAll(async () => {
    await app?.close();
  });

  testRan(
    () => app,
    [
      ['its endpoint, under the default version', 'post', '/v1/list', 200, 'root'],
      // NestJS serves it under the default version only; the pattern takes in no version too.
      [
        'a URL of its endpoint without the version, which nothing answers',
        'post',
        '/list',
        404,
        'root',
      ],
      ['an endpoint with a path parameter', 'post', '/v1/abc/view', 200, 'root'],
      ['the same, for a value that is the name beside it', 'post', '/v1/list/view', 404, 'root'],
    ],
    { title: 'runs its middleware for %s' },
  );
});
