import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import squads from '../src/squads/router';
import { appWithLog } from './order-log';

// The squads tree is the one the docs draw: `squads`, `squad` made with its child(), and the
// `invite` endpoint under that one, with a guard of its own. What the docs show of it is what
// this file asserts.
describe('a router, its child router and an endpoint under that one', () => {
  let app: INestApplication;
  let log: string[];
  beforeAll(async () => {
    ({ app, log } = await appWithLog([squads]));
  });

  test('start from the outer router in, for each hook in turn', () => {
    expect(log).toEqual([
      'squads init',
      'squad init',
      'invite init',
      'squads bootstrap',
      'squad bootstrap',
      'invite bootstrap',
    ]);
  });

  test('run the middleware, guards and interceptors of a request once each, from the outer router in', async () => {
    log.length = 0;
    await request(app.getHttpServer()).post('/squads/7/invite').expect(200);
    expect(log).toEqual([
      'squads middleware',
      'squad middleware',
      'squads guard',
      'squad guard',
      'invite guard',
      'squads interceptor before',
      'squad interceptor before',
      'invite handler',
      'squad interceptor after',
      'squads interceptor after',
    ]);
  });

  test('stop from the endpoint out, for each hook in turn', async () => {
    log.length = 0;
    await app.close();
    expect(log).toEqual([
      'invite destroy',
      'squad destroy',
      'squads destroy',
      'invite before shutdown',
      'squad before shutdown',
      'squads before shutdown',
      'invite shutdown',
      'squad shutdown',
      'squads shutdown',
    ]);
  });
});
