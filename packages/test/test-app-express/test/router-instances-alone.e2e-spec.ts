import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import inner from '../src/checkpoints/gate/inner/router';
import { appWith } from './app-with';

// This file loads the child before anything loads its parents: what it has of them, it
// brings itself.
describe('a child router an app loads by itself', () => {
  let app: INestApplication;
  beforeAll(async () => {
    ({ app } = await appWith([inner]));
  });
  afterAll(async () => {
    await app?.close();
  });

  test('has the guards and interceptors of the routers above it, made with what they provide', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/checkpoints/gate/inner/seen')
      .expect(200);
    expect(body).toEqual({
      ledger: expect.any(Number),
      checks: [
        expect.stringMatching(/^guard \d+ of checkpoints$/),
        'request guard of this request',
        expect.stringMatching(/^guard \d+ of gate$/),
        expect.stringMatching(/^interceptor \d+ of checkpoints$/),
        expect.stringMatching(/^interceptor \d+ of gate$/),
      ],
    });
  });
});
