import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import companyRouter from '../src/company/router';
import { appWithLog, each, noted, passed } from './order-log';

const routers = ['company', 'resources', 'clients', 'archive'];

describe('the routers of a tree, and what applies to their requests, run from the outer one in', () => {
  let app: INestApplication;
  let log: string[];
  beforeAll(async () => {
    ({ app, log } = await appWithLog([companyRouter]));
  });
  afterAll(async () => {
    await app?.close();
  });

  test("the start hooks, a router's after those of the routers above it", () => {
    expect(noted(log, routers, 'init')).toEqual(each(routers, 'init'));
    expect(noted(log, routers, 'bootstrap')).toEqual(each(routers, 'bootstrap'));
    // An endpoint's after its router's, whether or not the router has routers under it.
    expect(log.indexOf('clients endpoint init')).toBeGreaterThan(log.indexOf('clients init'));
    expect(log.indexOf('archive endpoint init')).toBeGreaterThan(log.indexOf('archive init'));
  });

  test('the middleware, the guards and the interceptors of a request', async () => {
    log.length = 0;
    await request(app.getHttpServer()).post('/company/resources/clients/list').expect(200);
    expect(log).toEqual(passed(routers.slice(0, 3), 'clients handler'));
  });

  test("those of a router alone, for an endpoint at its own base path and for one of a router's between", async () => {
    log.length = 0;
    await request(app.getHttpServer()).post('/company').expect(200);
    expect(log).toEqual([
      'company middleware',
      'company guard',
      'company interceptor before',
      'company interceptor after',
    ]);
    log.length = 0;
    await request(app.getHttpServer()).post('/company/resources/info').expect(200);
    expect(log).toEqual(passed(routers.slice(0, 2)));
  });

  test('and those of a router made with create() under them, after theirs', async () => {
    log.length = 0;
    await request(app.getHttpServer()).post('/company/resources/clients/archive/list').expect(200);
    expect(log).toEqual(passed(routers, 'archive handler'));
  });

  test("the shutdown hooks, a router's before those of the routers above it", async () => {
    log.length = 0;
    await app.close();
    for (const hook of ['destroy', 'before shutdown', 'shutdown']) {
      expect(noted(log, routers, hook)).toEqual(each(routers.toReversed(), hook));
    }
  });
});

// The app above had the whole tree. A router registers once in a process: this one loads a
// child of that tree by itself, after it.
describe('a child router an app loads by itself, after an app that had the whole tree', () => {
  let app: INestApplication;
  let log: string[];
  beforeAll(async () => {
    const { default: clientsRouter } = await import('../src/company/resources/clients/router');
    ({ app, log } = await appWithLog([clientsRouter]));
  });
  afterAll(async () => {
    await app?.close();
  });

  test('has what the routers above it apply to its requests, once, in the same order', async () => {
    log.length = 0;
    await request(app.getHttpServer()).post('/company/resources/clients/list').expect(200);
    expect(log).toEqual(passed(routers.slice(0, 3), 'clients handler'));
  });

  test('does not have the endpoints of the routers above it', async () => {
    await request(app.getHttpServer()).post('/company/info').expect(404);
    await request(app.getHttpServer()).post('/company/resources/info').expect(404);
  });
});
