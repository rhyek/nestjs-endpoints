import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import { APP_FILTER, HttpAdapterHost } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { setupEndpoints } from 'nestjs-endpoints';
import { Writable } from 'node:stream';
import request from 'supertest';
import { ZodError } from 'zod';
import { AppModule } from '../src/app.module';
import { AppointmentRepositoryToken } from '../src/user/appointment/appointment-repository.interface';
import { AppointmentRepository } from '../src/user/appointment/appointment.repository';
import { UserService } from '../src/user/user.service';
import { createApp } from './create-app';

describe('api', () => {
  async function setup() {
    const exceptionSpy = jest.fn();

    @Catch(ZodError)
    class ZodErrorExceptionFilter implements ExceptionFilter {
      constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

      catch(exception: ZodError, host: ArgumentsHost): void {
        exceptionSpy(exception);
        const { httpAdapter } = this.httpAdapterHost;
        const ctx = host.switchToHttp();
        httpAdapter.reply(
          ctx.getResponse(),
          {
            statusCode: 500,
            message: 'Internal server error',
          },
          500,
        );
      }
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      providers: [
        {
          provide: APP_FILTER,
          useClass: ZodErrorExceptionFilter,
        },
      ],
    }).compile();

    const app = await createApp(moduleFixture);

    const userService = app.get(UserService);
    const appointmentsRepository = app.get<AppointmentRepository>(
      AppointmentRepositoryToken,
    );
    const req = request(app.getHttpServer());

    return { userService, appointmentsRepository, req, exceptionSpy };
  }

  test.concurrent('user find input validation throws', async () => {
    const { req } = await setup();
    await req.get('/user/find').expect(400, {
      statusCode: 400,
      message: 'Validation failed',
      errors: [
        {
          code: 'invalid_type',
          expected: 'number',
          received: 'nan',
          path: ['id'],
          message: 'Expected number, received nan',
        },
      ],
    });
  });

  test.concurrent('user find can return null value', async () => {
    const { req } = await setup();
    await req.get('/user/find?id=1').expect(200, null);
  });

  test.concurrent('can return created user', async () => {
    const { req } = await setup();
    await req
      .post('/user/create')
      .send({ name: 'John', email: 'john@example.com' })
      .expect(200, { id: 1 });
    await req.get('/user/find?id=1').expect(200, {
      id: 1,
      name: 'John',
      email: 'john@example.com',
    });
  });

  test.concurrent('user create input validation throws', async () => {
    const { req } = await setup();
    await req
      .post('/user/create')
      .send({ namez: 'John', email: 'john@example.com' })
      .expect(400, {
        statusCode: 400,
        message: 'Validation failed',
        errors: [
          {
            code: 'invalid_type',
            expected: 'string',
            received: 'undefined',
            path: ['name'],
            message: 'Required',
          },
        ],
      });
  });

  test.concurrent('user find output validation throws ZodError', async () => {
    const { req, userService, exceptionSpy } = await setup();
    jest.spyOn(userService, 'find').mockReturnValueOnce({
      id: 1,
      namez: 'John',
      email: 'john@example.com',
    } as any);
    exceptionSpy.mockImplementation((exception) => {
      expect(exception).toBeInstanceOf(ZodError);
      expect((exception as ZodError).errors).toMatchObject([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'undefined',
          path: ['name'],
          message: 'Required',
        },
      ]);
    });
    await req.get('/user/find?id=1').expect(500);
  });

  test.concurrent('appointment create requires auth', async () => {
    const { req } = await setup();
    await req
      .post('/user/appointment/create')
      .send({
        userId: 1,
        date: new Date().toISOString(),
      })
      .expect(401);
  });

  test.concurrent('appointment create input validation throws', async () => {
    const { req } = await setup();
    await req
      .post('/user/appointment/create')
      .set('Authorization', 'secret')
      .send({
        userId: 1,
      })
      .expect(400, {
        statusCode: 400,
        message: 'Validation failed',
        errors: [
          { code: 'invalid_date', path: ['date'], message: 'Invalid date' },
        ],
      });
  });

  test.concurrent(
    'appointment create can return 400 with first schema of union',
    async () => {
      const { req } = await setup();
      const date1 = new Date();
      await req
        .post('/user/appointment/create')
        .set('Authorization', 'secret')
        .send({
          userId: 2,
          date: date1.toISOString(),
        })
        .expect(400, 'User not found');
    },
  );

  test.concurrent(
    'appointment create can return 200 with only schema',
    async () => {
      const { req } = await setup();
      await req
        .post('/user/create')
        .send({
          name: 'John',
          email: 'john@example.com',
        })
        .expect(200);
      const date = new Date(2025, 3, 7);
      const data = await req
        .post('/user/appointment/create')
        .set('Authorization', 'secret')
        .send({
          userId: 1,
          date: date.toISOString(),
        })
        .expect(201);
      expect(data.body).toMatchObject({
        id: 1,
        date: date.toISOString(),
        address: expect.stringContaining('127.0.0.1'),
      });
    },
  );

  test.concurrent(
    'appointment create can return 400 with second schema of union',
    async () => {
      const { req } = await setup();
      await req
        .post('/user/create')
        .send({
          name: 'John',
          email: 'john@example.com',
        })
        .expect(200);
      const date = new Date(2025, 3, 7);
      await req
        .post('/user/appointment/create')
        .set('Authorization', 'secret')
        .send({
          userId: 1,
          date: date.toISOString(),
        })
        .expect(201);
      await req
        .post('/user/appointment/create')
        .set('Authorization', 'secret')
        .send({
          userId: 1,
          date: date.toISOString(),
        })
        .expect(400, {
          message: 'Appointment has conflict',
          errorCode: 'APPOINTMENT_CONFLICT',
        });
    },
  );

  test.concurrent(
    'appointment create output validation throws ZodError',
    async () => {
      const { req, appointmentsRepository, exceptionSpy } = await setup();
      await req
        .post('/user/create')
        .send({
          name: 'John',
          email: 'john@example.com',
        })
        .expect(200);
      const date = new Date();
      jest.spyOn(appointmentsRepository, 'create').mockReturnValueOnce({
        id: 1,
        userId: 1,
        date: date.toISOString(), // should fail since zod output schema expects a Date
        address: '127.0.0.1',
      } as any);
      exceptionSpy.mockImplementationOnce((exception) => {
        expect(exception).toBeInstanceOf(ZodError);
        expect((exception as ZodError).errors).toMatchObject([
          {
            code: 'invalid_type',
            expected: 'date',
            received: 'string',
            path: ['date'],
            message: 'Expected date, received string',
          },
        ]);
      });
      await req
        .post('/user/appointment/create')
        .set('Authorization', 'secret')
        .send({
          userId: 1,
          date: date.toISOString(),
        })
        .expect(500, {
          statusCode: 500,
          message: 'Internal server error',
        });
    },
  );

  test.concurrent('appointment count returns number', async () => {
    const { req } = await setup();
    await req
      .get('/user/appointment/count?userId=1')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((resp) => {
        expect(resp.body).toBe(0);
      });
    await req
      .post('/user/create')
      .send({
        name: 'John',
        email: 'john@example.com',
      })
      .expect(200);
    await req
      .post('/user/appointment/create')
      .set('Authorization', 'secret')
      .send({
        userId: 1,
        date: new Date().toISOString(),
      })
      .expect(201);
    await req
      .get('/user/appointment/count?userId=1')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((resp) => {
        expect(resp.body).toBe(1);
      });
  });
});

it('spec works', async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useLogger(false);
  await app.init();

  let spec = '';
  const stream = new Writable({
    write(chunk, _, callback) {
      spec += chunk.toString();
      callback();
    },
  });
  await setupEndpoints(app, {
    openapi: {
      configure: (builder) => builder.setTitle('Test Api'),
      outputFile: stream,
    },
  });

  expect(spec).toBeTruthy();
  expect(JSON.parse(spec)).toMatchObject({
    openapi: '3.0.0',
    paths: {
      '/user/create': {
        post: {
          operationId: 'UserCreate',
          summary: '',
          tags: ['user'],
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/UserCreateInput',
                },
              },
            },
          },
          responses: {
            '200': {
              description: '',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/UserCreateOutput',
                  },
                },
              },
            },
          },
        },
      },
      '/user/find': {
        get: {
          operationId: 'UserFind',
          summary: '',
          tags: ['user'],
          parameters: [
            {
              name: 'id',
              required: true,
              in: 'query',
              schema: {
                type: 'number',
              },
            },
          ],
          responses: {
            '200': {
              description: '',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/UserFindOutput',
                  },
                },
              },
            },
          },
        },
      },
      '/user/appointment/create': {
        post: {
          operationId: 'UserAppointmentCreate',
          summary: 'Create an appointment',
          tags: ['user', 'user/appointment'],
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/UserAppointmentCreateInput',
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Appointment created',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/UserAppointmentCreate201Output',
                  },
                },
              },
            },
            '400': {
              description: '',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/UserAppointmentCreate400Output',
                  },
                },
              },
            },
          },
        },
      },
      '/user/appointment/count': {
        get: {
          operationId: 'UserAppointmentCount',
          summary: '',
          tags: ['user', 'user/appointment'],
          parameters: [
            {
              name: 'userId',
              required: true,
              in: 'query',
              schema: {
                type: 'number',
              },
            },
          ],
          responses: {
            '200': {
              description: '',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/UserAppointmentCountOutput',
                  },
                },
              },
            },
          },
        },
      },
    },
    info: {
      title: 'Test Api',
      description: '',
      version: '1.0.0',
      contact: {},
    },
    tags: [],
    servers: [],
    components: {
      schemas: {
        UserCreateInput: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
            },
            email: {
              type: 'string',
              format: 'email',
            },
          },
          required: ['name', 'email'],
        },
        UserCreateOutput: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
            },
          },
          required: ['id'],
        },
        UserFindOutput: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
            },
            name: {
              type: 'string',
            },
            email: {
              type: 'string',
            },
          },
          required: ['id', 'name', 'email'],
          nullable: true,
        },
        UserAppointmentCreateInput: {
          type: 'object',
          properties: {
            userId: {
              type: 'number',
            },
            date: {},
          },
          required: ['userId', 'date'],
        },
        UserAppointmentCreate201Output: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
            },
            date: {},
            address: {
              type: 'string',
            },
          },
          required: ['id', 'date', 'address'],
        },
        UserAppointmentCreate400Output: {
          oneOf: [
            {
              type: 'string',
            },
            {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                },
                errorCode: {
                  type: 'string',
                },
              },
              required: ['message', 'errorCode'],
            },
          ],
        },
        UserAppointmentCountOutput: {
          type: 'number',
        },
      },
    },
  });
});
