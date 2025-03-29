import { TestingModule, Test } from '@nestjs/testing';
import Axios from 'axios';
import { userCreate, userFind } from '../generated/client';
import { setAxiosInstance } from '../generated/custom-axios-instance';
import { AppModule } from '../src/app.module';

describe('generated client', () => {
  test('create user', async () => {
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
      setAxiosInstance(axios);
      const { id } = await userCreate({
        name: 'Jake',
        email: 'jake@gmail.com',
      });
      const user = await userFind({ id });
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
