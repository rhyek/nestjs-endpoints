import { Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { endpoint, z } from 'nestjs-endpoints';
import request from 'supertest';

describe('raw input', () => {
  test('raw input is available in the handler', async () => {
    const testEndpoint = endpoint({
      method: 'post',
      path: '/test',
      input: z.object({
        name: z.string(),
      }),
      handler: (params) => {
        return {
          input: params.input,
          rawInput: params.rawInput,
        };
      },
    });
    @Module({
      controllers: [testEndpoint],
    })
    class TestModule {}

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    const app = moduleFixture.createNestApplication();
    try {
      await app.init();
      await app.listen(0);
      const req = request(app.getHttpServer());

      await req
        .post('/test')
        .send({
          name: 'John',
          age: 30,
        })
        .expect(200)
        .then((resp) => {
          expect(resp.body).toEqual({
            input: {
              name: 'John',
            },
            rawInput: {
              name: 'John',
              age: 30,
            },
          });
        });
    } finally {
      await app.close();
    }
  });
});
