import { TestingModule, Test } from '@nestjs/testing';
import Axios from 'axios';
import { createApiClient } from '../generated/axios-client';
import { AppModule } from '../src/app.module';

describe('generated client', () => {
  test.concurrent('create user - axios instance', async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(0);
    try {
      const axios = Axios.create({
        baseURL: await app.getUrl(),
      });
      const client = createApiClient(axios);
      const {
        data: { id },
      } = await client.userCreate({
        name: 'Jake',
        email: 'jake@gmail.com',
      });
      const { data: user } = await client.userFind({ id });
      expect(user).toEqual({
        id,
        name: 'Jake',
        email: 'jake@gmail.com',
      });
    } finally {
      await app.close();
    }
  });

  test.concurrent('create user - axios config', async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(0);
    try {
      const client = createApiClient({
        baseURL: await app.getUrl(),
      });
      const {
        data: { id },
      } = await client.userCreate({
        name: 'Jake',
        email: 'jake@gmail.com',
      });
      const { data: user } = await client.userFind({ id });
      expect(user).toEqual({
        id,
        name: 'Jake',
        email: 'jake@gmail.com',
      });
    } finally {
      await app.close();
    }
  });
});
