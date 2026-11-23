import { INestApplication } from '@nestjs/common';
import { NestjsEndpoints } from 'nestjs-endpoints';
import request from 'supertest';
import { OrderLog, OrderModule, recording } from '../src/company/order';
import { appWithLog, each, noted, passed } from './order-log';

const routers = ['root', 'company', 'resources', 'clients'];

// The root router of this app finds the company router, made with `create()`, in the folder
// it looks in: its hooks, middleware, guards and interceptors come before that tree's.
describe('the root router of an app, above a tree of routers it finds', () => {
  let app: INestApplication;
  let log: string[];
  beforeAll(async () => {
    const root = NestjsEndpoints.forRoot({
      router: {
        rootDirectory: '../src/company',
        imports: [OrderModule],
        inject: { log: OrderLog },
        ...recording('root'),
      },
    });
    ({ app, log } = await appWithLog([root]));
  });
  afterAll(async () => {
    await app?.close();
  });

  test('starts first', () => {
    expect(noted(log, routers, 'init')).toEqual(each(routers, 'init'));
  });

  test('has its middleware, guards and interceptors run first for a request three routers down', async () => {
    log.length = 0;
    await request(app.getHttpServer()).post('/company/resources/clients/list').expect(200);
    expect(log).toEqual(passed(routers, 'clients handler'));
  });

  test("a guard of an endpoint's own runs after those of every router above it", async () => {
    log.length = 0;
    await request(app.getHttpServer()).post('/company/resources/clients/guarded').expect(200);
    expect(log).toEqual([
      ...each(routers, 'middleware'),
      ...each(routers, 'guard'),
      'endpoint guard',
      ...each(routers, 'interceptor before'),
      'guarded handler',
      ...each(routers.toReversed(), 'interceptor after'),
    ]);
  });

  test('stops last', async () => {
    log.length = 0;
    await app.close();
    expect(noted(log, routers, 'destroy')).toEqual(each(routers.toReversed(), 'destroy'));
  });
});
