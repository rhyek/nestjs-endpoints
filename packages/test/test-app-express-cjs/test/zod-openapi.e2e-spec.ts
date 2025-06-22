import { Writable } from 'stream';
import { Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { endpoint, setupOpenAPI, z } from 'nestjs-endpoints';
import request from 'supertest';
import { createApp } from './create-app';

describe('zod-openapi', () => {
  test('payloads are correct', async () => {
    const testEndpoint = endpoint({
      method: 'post',
      path: '/test',
      input: z.object({
        name: z.string(),
        age: z.number().default(30),
      }),
      output: z.object({
        name: z.string(),
        age: z.number(),
        height: z.number().default(175),
      }),
      handler: ({ input }) => {
        return input;
      },
    });
    @Module({
      controllers: [testEndpoint],
    })
    class TestModule {}

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    const app = await createApp(moduleFixture);
    try {
      const req = request(app.getHttpServer());

      await req
        .post('/test')
        .send({
          name: 'John',
        })
        .expect(200)
        .then((resp) => {
          expect(resp.body).toEqual({
            name: 'John',
            age: 30,
            height: 175,
          });
        });
    } finally {
      await app.close();
    }
  });
  test('openapi schema is generated correctly', async () => {
    const testEndpoint = endpoint({
      method: 'post',
      path: '/test',
      input: z.object({
        name: z.string(),
        age: z.number().default(30),
      }),
      output: z.object({
        name: z.string(),
        age: z.number(),
        height: z.number().default(175),
      }),
      handler: ({ input }) => {
        return input;
      },
    });
    @Module({
      controllers: [testEndpoint],
    })
    class TestModule {}

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    const app = await createApp(moduleFixture);
    let spec = '';
    const stream = new Writable({
      write(chunk, _, callback) {
        spec += chunk.toString();
        callback();
      },
    });
    await setupOpenAPI(app, {
      outputFile: stream,
    });
    try {
      expect(spec).toBeTruthy();
      const parsed = JSON.parse(spec);
      expect(parsed).toEqual({
        openapi: '3.0.0',
        servers: [],
        tags: [],
        info: {
          contact: {},
          description: '',
          'nestjs-endpoints': {
            version: '0.0.0',
          },
          title: '',
          version: '1.0.0',
        },
        paths: {
          '/test': {
            post: {
              operationId: 'Test',
              parameters: [],
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/TestInput',
                    },
                  },
                },
                required: true,
              },
              responses: {
                '200': {
                  content: {
                    'application/json': {
                      schema: {
                        $ref: '#/components/schemas/TestOutput',
                      },
                    },
                  },
                  description: '',
                },
              },
              summary: '',
              tags: [],
            },
          },
        },
        components: {
          schemas: {
            TestInput: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                },
                age: {
                  type: 'number',
                  default: 30,
                },
              },
              required: ['name'],
            },
            TestOutput: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                },
                age: {
                  type: 'number',
                },
                height: {
                  type: 'number',
                  default: 175,
                },
              },
              required: ['name', 'age', 'height'],
            },
          },
        },
      });
    } finally {
      await app.close();
    }
  });
});
