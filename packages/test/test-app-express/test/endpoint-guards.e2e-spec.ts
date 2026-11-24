import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import companyRouter from '../src/company/router';
import { appWithLog } from './order-log';

// The company tree: `company` is made with create(), `resources` with its child(), and
// `clients` with that one's child(). Each router has a guard, an interceptor and middleware
// that note in the log what they did.
describe('guards and interceptors, of the routers of a tree and of an endpoint', () => {
  let app: INestApplication;
  let log: string[];
  beforeAll(async () => {
    ({ app, log } = await appWithLog([companyRouter]));
  });
  afterAll(async () => {
    await app?.close();
  });

  async function call(path: string, status: number) {
    log.length = 0;
    await request(app.getHttpServer()).post(path).expect(status);
    return [...log];
  }

  test("a child router's guards and interceptors run after its parent's, and an endpoint's after its routers'", async () => {
    expect(await call('/company/resources/clients/own', 200)).toEqual([
      'company middleware',
      'resources middleware',
      'clients middleware',
      'company guard',
      'resources guard',
      'clients guard',
      'endpoint guard',
      'company interceptor before',
      'resources interceptor before',
      'clients interceptor before',
      'endpoint interceptor before',
      'own handler',
      'endpoint interceptor after',
      'clients interceptor after',
      'resources interceptor after',
      'company interceptor after',
    ]);
  });

  test("an endpoint's `guards` and `interceptors` run where the same ones in `decorators` run", async () => {
    const own = await call('/company/resources/clients/own', 200);
    const decorated = await call('/company/resources/clients/decorated', 200);
    expect(decorated).toEqual(own.map((entry) => entry.replace('own', 'decorated')));
  });

  test('with both, those in `guards` and `interceptors` run before those in `decorators`', async () => {
    expect(await call('/company/resources/clients/both', 200)).toEqual([
      'company middleware',
      'resources middleware',
      'clients middleware',
      'company guard',
      'resources guard',
      'clients guard',
      'option guard',
      'decorator guard',
      'company interceptor before',
      'resources interceptor before',
      'clients interceptor before',
      'option interceptor before',
      'decorator interceptor before',
      'both handler',
      'decorator interceptor after',
      'option interceptor after',
      'clients interceptor after',
      'resources interceptor after',
      'company interceptor after',
    ]);
  });

  test("an endpoint guard that refuses ends the request with a 403, after its routers' guards and before its handler", async () => {
    expect(await call('/company/resources/clients/refused', 403)).toEqual([
      'company middleware',
      'resources middleware',
      'clients middleware',
      'company guard',
      'resources guard',
      'clients guard',
    ]);
  });
});
