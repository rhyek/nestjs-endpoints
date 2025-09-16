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
      path: '/test1',
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
        .post('/test1')
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
      path: '/test2',
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
      expect(parsed).toMatchObject({
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
          '/test2': {
            post: {
              operationId: 'Test2',
              parameters: [],
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/Test2Input',
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
                        $ref: '#/components/schemas/Test2Output',
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
            Test2Input: {
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
            Test2Output: {
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
              additionalProperties: false,
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
