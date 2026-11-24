import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import resourcesRouter from '../src/company/resources/router';
import { appWithLog, each, noted, passed } from './order-log';

const routers = ['company', 'resources', 'clients', 'archive'];

// `resources` is between `company`, which this app does not have, and `clients`, which it
// finds, with the router made with `create()` under that.
describe('a router between its parent and its own children, in an app without its parent', () => {
  let app: INestApplication;
  let log: string[];
  beforeAll(async () => {
    ({ app, log } = await appWithLog([resourcesRouter]));
  });
  afterAll(async () => {
    await app?.close();
  });

  test('starts after its parent, and the routers under it after it', () => {
    for (const hook of ['init', 'bootstrap']) {
      expect(noted(log, routers, hook)).toEqual(each(routers, hook));
    }
  });

  test("its own endpoint has its parent's middleware, guards and interceptors before its own", async () => {
    log.length = 0;
    await request(app.getHttpServer()).post('/company/resources/info').expect(200);
    expect(log).toEqual(passed(routers.slice(0, 2)));
  });

  test('the endpoint of a child it finds has them once, though both are without the parent', async () => {
    log.length = 0;
    await request(app.getHttpServer()).post('/company/resources/clients/list').expect(200);
    expect(log).toEqual(passed(routers.slice(0, 3), 'clients handler'));
  });

  test("its parent's endpoints are not in the app", async () => {
    await request(app.getHttpServer()).post('/company/info').expect(404);
    await request(app.getHttpServer()).post('/company').expect(404);
  });

  test('stops before its parent, and the routers under it before it', async () => {
    log.length = 0;
    await app.close();
    for (const hook of ['destroy', 'before shutdown', 'shutdown']) {
      expect(noted(log, routers, hook)).toEqual(each(routers.toReversed(), hook));
    }
  });
});
