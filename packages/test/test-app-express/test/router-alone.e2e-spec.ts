import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import clientsRouter from '../src/company/resources/clients/router';
import companyRouter from '../src/company/router';
import { appWithLog, each, noted, passed } from './order-log';

const lineage = ['company', 'resources', 'clients'];
const routers = [...lineage, 'archive'];

// This file loads the child before anything loads its parents: what it has of them, it
// brings itself.
describe('a child router an app loads by itself', () => {
  let app: INestApplication;
  let log: string[];
  beforeAll(async () => {
    ({ app, log } = await appWithLog([clientsRouter]));
  });
  afterAll(async () => {
    await app?.close();
  });

  test('starts after the routers above it, whose lifecycle hooks run', () => {
    for (const hook of ['init', 'bootstrap']) {
      expect(noted(log, routers, hook)).toEqual(each(routers, hook));
    }
  });

  test('has the URLs it has in the whole app, and what the routers above it apply to them', async () => {
    log.length = 0;
    await request(app.getHttpServer())
      .post('/company/resources/clients/list')
      .expect(200, ['acme']);
    expect(log).toEqual(passed(lineage, 'clients handler'));
  });

  test('has the routers nested under it', async () => {
    await request(app.getHttpServer())
      .post('/company/resources/clients/archive/list')
      .expect(200, ['old']);
  });

  test('does not have the endpoints of the routers above it', async () => {
    await request(app.getHttpServer()).post('/company/info').expect(404);
    await request(app.getHttpServer()).post('/company/resources/info').expect(404);
  });

  test('stops before the routers above it', async () => {
    log.length = 0;
    await app.close();
    for (const hook of ['destroy', 'before shutdown', 'shutdown']) {
      expect(noted(log, routers, hook)).toEqual(each(routers.toReversed(), hook));
    }
  });
});

describe('the whole tree, in an app after one that loaded the child by itself', () => {
  let app: INestApplication;
  let log: string[];
  beforeAll(async () => {
    ({ app, log } = await appWithLog([companyRouter]));
  });
  afterAll(async () => {
    await app?.close();
  });

  test('starts every router after those above it', () => {
    expect(noted(log, routers, 'init')).toEqual(each(routers, 'init'));
  });

  test('applies to the child what it applied by itself, once', async () => {
    log.length = 0;
    await request(app.getHttpServer()).post('/company/resources/clients/list').expect(200);
    expect(log).toEqual(passed(lineage, 'clients handler'));
  });

  test('has the endpoints of every router', async () => {
    await request(app.getHttpServer()).post('/company/info').expect(200);
    await request(app.getHttpServer()).post('/company/resources/info').expect(200);
  });
});
