import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('vanilla controller', { concurrent: true }, () => {
  async function setup() {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(0);
    return { app };
  }
  test('get null', async () => {
    const { app } = await setup();
    const req = request(app.getHttpServer());
    try {
      await req.get('/vanilla/null').expect(200, {});
    } finally {
      await app.close();
    }
  });
  test('post null', async () => {
    const { app } = await setup();
    const req = request(app.getHttpServer());
    try {
      await req.post('/vanilla/null').expect(201, {});
    } finally {
      await app.close();
    }
  });
});
