import { Writable } from 'node:stream';
import { ArgumentsHost, Catch } from '@nestjs/common';
import { APP_FILTER, BaseExceptionFilter } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import {
  endpoint,
  setupOpenAPI,
  z,
  ZodSerializationException,
  ZodValidationException,
} from 'nestjs-endpoints';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AppointmentRepositoryToken } from '../src/endpoints/user/appointment/appointment-repository.interface';
import { AppointmentRepository } from '../src/endpoints/user/appointment/appointment.repository';
import { UserService } from '../src/endpoints/user/user.service';
import { createApp } from './create-app';

describe('api', { concurrent: true }, () => {
  async function setup() {
    const validationExceptionSpy = vitest.fn();
    const serializationExceptionSpy = vitest.fn();

    @Catch(ZodValidationException)
    class ZodValidationExceptionFilter extends BaseExceptionFilter {
      catch(exception: ZodValidationException, host: ArgumentsHost) {
        validationExceptionSpy(exception);
        // eslint-disable-next-line promise/valid-params -- the filter's `catch`, not a promise's
        super.catch(exception, host);
      }
    }

    @Catch(ZodSerializationException)
    class ZodSerializationExceptionFilter extends BaseExceptionFilter {
      catch(exception: ZodSerializationException, host: ArgumentsHost) {
        serializationExceptionSpy(exception);
        // eslint-disable-next-line promise/valid-params -- the filter's `catch`, not a promise's
        super.catch(exception, host);
      }
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      providers: [
        {
          provide: APP_FILTER,
          useClass: ZodValidationExceptionFilter,
        },
        {
          provide: APP_FILTER,
          useClass: ZodSerializationExceptionFilter,
        },
      ],
    }).compile();

    const { app, httpAdapter } = await createApp(moduleFixture);
    app.useLogger(false);

    const userService = app.get(UserService);
    const appointmentsRepository = app.get<AppointmentRepository>(AppointmentRepositoryToken);
    const req = request(app.getHttpServer());

    return {
      app,
      httpAdapter,
      req,
      userService,
      appointmentsRepository,
      validationExceptionSpy,
      serializationExceptionSpy,
    };
  }

  test('error endpoint throws', async () => {
    const { req, validationExceptionSpy, serializationExceptionSpy } = await setup();
    await req.post('/test/error').expect(500, {
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(validationExceptionSpy).toHaveBeenCalledTimes(0);
    expect(serializationExceptionSpy).toHaveBeenCalledTimes(0);
  });

  test('user get inexistent user returns 404', async () => {
    const { req } = await setup();
    await req.post('/user/get').send({ id: 1 }).expect(404, {
      statusCode: 404,
      message: 'User not found',
      error: 'Not Found',
    });
  });

  test('user find input validation throws', async () => {
    const { req, validationExceptionSpy, serializationExceptionSpy } = await setup();
    validationExceptionSpy.mockImplementationOnce((exception) => {
      expect(exception).toBeInstanceOf(ZodValidationException);
      expect(exception.message).toBe('Validation failed');
      expect(exception.getZodError().issues).toMatchObject([
        {
          expected: 'number',
          code: 'invalid_type',
          received: 'NaN',
          path: ['id'],
          message: 'Invalid input: expected number, received NaN',
        },
      ]);
    });
    await req
      .post('/user/find')
      .send({})
      .expect(400, {
        statusCode: 400,
        message: 'Validation failed',
        errors: [
          {
            expected: 'number',
            code: 'invalid_type',
            received: 'NaN',
            path: ['id'],
            message: 'Invalid input: expected number, received NaN',
          },
        ],
      });
    expect(validationExceptionSpy).toHaveBeenCalledTimes(1);
    expect(serializationExceptionSpy).toHaveBeenCalledTimes(0);
  });

  test('a request without a body reads as an empty object', async () => {
    const { req } = await setup();
    // The issue is the missing field, not a missing object.
    await req
      .post('/search')
      .expect(400)
      .then((resp) => {
        expect(resp.body.errors).toMatchObject([{ path: ['term'] }]);
      });
  });

  test('user find can return null value', async () => {
    const { req, httpAdapter } = await setup();
    // await req.post('/user/find').send({ id: 1 }).expect(200, null);
    // http://github.com/nestjs/nest/issues/10415
    await req
      .post('/user/find')
      .send({ id: 1 })
      .expect(200)
      .then((resp) => {
        expect(resp.body).toBe(httpAdapter === 'express' ? '' : null);
      });
  });

  test('can return created user', async () => {
    const { req } = await setup();
    await req
      .post('/user/create')
      .send({ name: 'John', email: 'john@example.com' })
      .expect(200, { id: 1 });
    await req.post('/user/find').send({ id: 1 }).expect(200, {
      id: 1,
      name: 'John',
      email: 'john@example.com',
    });
  });

  test('user create input validation throws', async () => {
    const { req, validationExceptionSpy, serializationExceptionSpy } = await setup();
    await req
      .post('/user/create')
      .send({ namez: 'John', email: 'john@example.com' })
      .expect(400, {
        statusCode: 400,
        message: 'Validation failed',
        errors: [
          {
            expected: 'string',
            code: 'invalid_type',
            path: ['name'],
            message: 'Invalid input: expected string, received undefined',
          },
        ],
      });
    expect(validationExceptionSpy).toHaveBeenCalledTimes(1);
    expect(serializationExceptionSpy).toHaveBeenCalledTimes(0);
  });

  test('user find output validation throws ZodSerializationException', async () => {
    const { req, userService, validationExceptionSpy, serializationExceptionSpy } = await setup();
    vitest.spyOn(userService, 'find').mockReturnValueOnce({
      id: 1,
      namez: 'John',
      email: 'john@example.com',
    } as any);
    let exception: any;
    serializationExceptionSpy.mockImplementation((_exception) => {
      exception = _exception;
    });
    await req.post('/user/find').send({ id: 1 }).expect(500);
    expect(validationExceptionSpy).toHaveBeenCalledTimes(0);
    expect(serializationExceptionSpy).toHaveBeenCalledTimes(1);
    expect(exception).toBeInstanceOf(ZodSerializationException);
    expect(exception.message).toBe('Internal Server Error');
    expect((exception as ZodSerializationException).getZodError().issues).toMatchObject([
      {
        expected: 'string',
        code: 'invalid_type',
        path: ['name'],
        message: 'Invalid input: expected string, received undefined',
      },
    ]);
  });

  test('appointment create requires auth', async () => {
    const { req } = await setup();
    await req
      .post('/user/appointment/create')
      .send({
        userId: 1,
        date: new Date().toISOString(),
      })
      .expect(401);
  });

  test('appointment create input validation throws', async () => {
    const { req, validationExceptionSpy, serializationExceptionSpy } = await setup();
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
          {
            expected: 'date',
            code: 'invalid_type',
            received: 'Invalid Date',
            path: ['date'],
            message: 'Invalid input: expected date, received Date',
          },
        ],
      });
    expect(validationExceptionSpy).toHaveBeenCalledTimes(1);
    expect(serializationExceptionSpy).toHaveBeenCalledTimes(0);
  });

  test('appointment create can return 400 with first schema of union', async () => {
    const { req, validationExceptionSpy, serializationExceptionSpy } = await setup();
    const date1 = new Date();
    await req
      .post('/user/appointment/create')
      .set('Authorization', 'secret')
      .send({
        userId: 2,
        date: date1.toISOString(),
      })
      .expect(400, 'User not found');
    expect(validationExceptionSpy).toHaveBeenCalledTimes(0);
    expect(serializationExceptionSpy).toHaveBeenCalledTimes(0);
  });

  test('appointment create can return 200 with only schema', async () => {
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
  });

  test('appointment create can return 400 with second schema of union', async () => {
    const { req, validationExceptionSpy, serializationExceptionSpy } = await setup();
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
    expect(validationExceptionSpy).toHaveBeenCalledTimes(0);
    expect(serializationExceptionSpy).toHaveBeenCalledTimes(0);
  });

  test('appointment create output validation throws ZodSerializationException', async () => {
    const { req, appointmentsRepository, validationExceptionSpy, serializationExceptionSpy } =
      await setup();
    await req
      .post('/user/create')
      .send({
        name: 'John',
        email: 'john@example.com',
      })
      .expect(200);
    const date = new Date();
    vitest.spyOn(appointmentsRepository, 'create').mockReturnValueOnce({
      id: 1,
      userId: 1,
      date: date.toISOString(), // should fail since zod output schema expects a Date
      address: '127.0.0.1',
    } as any);
    let exception: any;
    serializationExceptionSpy.mockImplementationOnce((_exception) => {
      exception = _exception;
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
        message: 'Internal Server Error',
      });
    expect(validationExceptionSpy).toHaveBeenCalledTimes(0);
    expect(serializationExceptionSpy).toHaveBeenCalledTimes(1);
    expect(exception).toBeInstanceOf(ZodSerializationException);
    expect((exception as ZodSerializationException).getZodError().issues).toMatchObject([
      {
        expected: 'date',
        code: 'invalid_type',
        path: ['date'],
        message: 'Invalid input: expected date, received string',
      },
    ]);
  });

  test('appointment count returns number', async () => {
    const { req } = await setup();
    await req
      .post('/user/appointment/count')
      .send({ userId: 1 })
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
      .post('/user/appointment/count')
      .send({ userId: 1 })
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((resp) => {
        expect(resp.body).toBe(1);
      });
  });

  test('can access input schema in handler', async () => {
    const { req } = await setup();
    await req
      .post('/user/create')
      .send({ name: 'error', email: 'john@example.com' })
      .expect(400, {
        statusCode: 400,
        message: 'Validation failed',
        errors: [
          {
            code: 'custom',
            message: 'The name triggered me',
            path: ['name'],
          },
        ],
      });
  });

  test('can override a provider', async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(UserService)
      .useValue({
        find: () => ({
          id: 34,
          name: 'John',
          email: 'john@hotmail.com',
        }),
      })
      .compile();
    const { app } = await createApp(moduleFixture);
    app.useLogger(false);
    const req = request(app.getHttpServer());
    await req.post('/user/find').send({ id: 1 }).expect(200, {
      id: 34,
      name: 'John',
      email: 'john@hotmail.com',
    });
    await req
      .post('/user/find')
      .send({ id: 1 })
      .expect(200)
      .then((resp) => {
        expect(resp.body).toMatchObject({
          id: 34,
          email: 'john@hotmail.com',
        });
      });
  });

  test('can access auth endpoints', async () => {
    const { req } = await setup();
    await req
      .post('/auth/login')
      .send({
        email: 'john@example.com',
        password: 'password',
      })
      .expect(200)
      .then((resp) => {
        expect(resp.body).toMatchObject({
          token: expect.any(String),
        });
      });
  });

  test('greet endpoint returns greeting', async () => {
    const { req } = await setup();
    await req.post('/greet').send({ name: 'John' }).expect(200, 'Hello, John!');
  });

  test('greet endpoint input validation throws', async () => {
    const { req, validationExceptionSpy, serializationExceptionSpy } = await setup();
    await req
      .post('/greet')
      .send({ wrongField: 'John' })
      .expect(400, {
        statusCode: 400,
        message: 'Validation failed',
        errors: [
          {
            expected: 'string',
            code: 'invalid_type',
            path: ['name'],
            message: 'Invalid input: expected string, received undefined',
          },
        ],
      });
    expect(validationExceptionSpy).toHaveBeenCalledTimes(1);
    expect(serializationExceptionSpy).toHaveBeenCalledTimes(0);
  });

  test('complex query parameters work', async () => {
    const { req } = await setup();
    await req
      .get('/complex-get')
      .query({ 'add[a]': 5, 'add[b]': 7 })
      .expect(200)
      .then((resp) => {
        expect(resp.body).toBe(12);
      });
  });

  test('a GET endpoint reads its search params', async () => {
    const { req } = await setup();
    await req
      .get('/oauth/callback')
      .query({ code: 'abc', state: 'xyz', expiresIn: '3600' })
      .expect(200, { code: 'abc', state: 'xyz', expiresIn: 3600 });
  });

  test('a GET endpoint validates its search params', async () => {
    const { req, validationExceptionSpy, serializationExceptionSpy } = await setup();
    await req
      .get('/oauth/callback')
      .query({ code: 'abc', expiresIn: 'soon' })
      .expect(400, {
        statusCode: 400,
        message: 'Validation failed',
        errors: [
          {
            expected: 'string',
            code: 'invalid_type',
            path: ['state'],
            message: 'Invalid input: expected string, received undefined',
          },
          {
            expected: 'number',
            code: 'invalid_type',
            received: 'NaN',
            path: ['expiresIn'],
            message: 'Invalid input: expected number, received NaN',
          },
        ],
      });
    expect(validationExceptionSpy).toHaveBeenCalledTimes(1);
    expect(serializationExceptionSpy).toHaveBeenCalledTimes(0);
  });

  test('a GET endpoint answers no other method', async () => {
    const { req } = await setup();
    await req
      .post('/oauth/callback')
      .query({ code: 'abc', state: 'xyz', expiresIn: '3600' })
      .expect(404);
  });

  test('an endpoint reads its search params and its body together', async () => {
    const { req } = await setup();
    await req
      .post('/search')
      .query({ page: '2' })
      .send({ term: 'pizza', tags: ['vegan'] })
      .expect(200, { term: 'pizza', tags: ['vegan'], page: 2 });
    // Both sides apply their defaults.
    await req
      .post('/search')
      .send({ term: 'pizza' })
      .expect(200, { term: 'pizza', tags: [], page: 1 });
  });

  test('an endpoint validates its search params and its body', async () => {
    const { req, validationExceptionSpy } = await setup();
    await req
      .post('/search')
      .query({ page: '2' })
      .send({ term: '' })
      .expect(400)
      .then((resp) => {
        expect(resp.body.errors).toMatchObject([{ code: 'too_small', path: ['term'] }]);
      });
    await req
      .post('/search')
      .query({ page: '0' })
      .send({ term: 'pizza' })
      .expect(400)
      .then((resp) => {
        expect(resp.body.errors).toMatchObject([{ code: 'too_small', path: ['page'] }]);
      });
    expect(validationExceptionSpy).toHaveBeenCalledTimes(2);
  });

  test('nested endpoints router module: recipes create works', async () => {
    const { req } = await setup();
    await req.post('/recipes/create').send({ name: 'Pizza' }).expect(200, { id: 1, name: 'Pizza' });
    await req.post('/recipes/create').send({ name: 'Pasta' }).expect(200, { id: 2, name: 'Pasta' });
  });

  test('manual endpoints router module: recipes-manual-1 create works', async () => {
    const { req } = await setup();
    await req
      .post('/recipes-manual-1/create')
      .send({ name: 'Pizza' })
      .expect(200, { id: 1, name: 'Pizza', manual: true });
    await req
      .post('/recipes-manual-1/create')
      .send({ name: 'Pasta' })
      .expect(200, { id: 2, name: 'Pasta', manual: true });
  });

  test('nested endpoints router module: recipes create input validation throws', async () => {
    const { req, validationExceptionSpy, serializationExceptionSpy } = await setup();
    await req
      .post('/recipes/create')
      .send({})
      .expect(400, {
        statusCode: 400,
        message: 'Validation failed',
        errors: [
          {
            expected: 'string',
            code: 'invalid_type',
            path: ['name'],
            message: 'Invalid input: expected string, received undefined',
          },
        ],
      });
    expect(validationExceptionSpy).toHaveBeenCalledTimes(1);
    expect(serializationExceptionSpy).toHaveBeenCalledTimes(0);
  });
});

test('a GET endpoint cannot declare input', () => {
  // A GET request has no body, so `input` is refused by the types (tscheck
  // fails if this directive goes unused) and when the endpoint is defined.
  expect(() =>
    endpoint.query({
      method: 'get',
      // @ts-expect-error: `input` is `never` on a GET endpoint.
      input: z.object({ name: z.string() }),
      handler: () => null,
    }),
  ).toThrow(/a GET endpoint cannot declare `input`/);
});

test('a request without a body reads as `{}`, unless the input accepts `undefined`', async () => {
  const allOptional = endpoint.mutation({
    path: '/no-body/all-optional',
    input: z.object({ a: z.string().default('x') }),
    output: z.object({ a: z.string() }),
    handler: ({ input }) => input,
  });
  const optionalBody = endpoint.mutation({
    path: '/no-body/optional',
    input: z.object({ a: z.string() }).optional(),
    output: z.object({ given: z.boolean() }),
    handler: ({ input }) => ({ given: input !== undefined }),
  });
  const moduleFixture = await Test.createTestingModule({
    controllers: [allOptional, optionalBody],
  }).compile();
  const { app } = await createApp(moduleFixture);
  try {
    const req = request(app.getHttpServer());
    await req.post('/no-body/all-optional').expect(200, { a: 'x' });
    await req.post('/no-body/optional').expect(200, { given: false });
  } finally {
    await app.close();
  }
});

test('spec works', async () => {
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
  await setupOpenAPI(app, {
    configure: (builder) => builder.setTitle('Test Api'),
    outputFile: stream,
  });

  expect(spec).toBeTruthy();
  const parsed = JSON.parse(spec);
  expect(parsed).toMatchObject({
    openapi: '3.0.0',
    paths: {
      '/auth/login': {
        post: {
          operationId: 'AuthLogin',
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/AuthLoginInput',
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
                    $ref: '#/components/schemas/AuthLoginOutput',
                  },
                },
              },
            },
          },
          summary: '',
          tags: ['auth'],
        },
      },
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
        post: {
          operationId: 'UserFind',
          summary: '',
          tags: ['user'],
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/UserFindInput',
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
          tags: ['user/appointment'],
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
        post: {
          operationId: 'UserAppointmentCount',
          summary: '',
          tags: ['user/appointment'],
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/UserAppointmentCountInput',
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
          oneOf: [
            {
              type: 'object',
              additionalProperties: false,
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
            },
            {
              type: 'null',
            },
          ],
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
  expect(parsed).toMatchObject({
    paths: {
      '/recipes/create': {
        post: {
          operationId: 'RecipesCreate',
          summary: '',
          tags: ['recipes'],
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/RecipesCreateInput',
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
                    $ref: '#/components/schemas/RecipesCreateOutput',
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        RecipesCreateOutput: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
            },
            name: {
              type: 'string',
            },
          },
          required: ['id', 'name'],
        },
      },
    },
  });
  expect(parsed).toMatchObject({
    paths: {
      '/recipes-manual-1/create': {
        post: {
          operationId: 'RecipesManual1Create',
          summary: '',
          tags: ['recipes-manual-1'],
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/RecipesManual1CreateInput',
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
                    $ref: '#/components/schemas/RecipesManual1CreateOutput',
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        RecipesManual1CreateOutput: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
            },
            name: {
              type: 'string',
            },
            manual: {
              type: 'boolean',
            },
          },
          required: ['id', 'name', 'manual'],
        },
      },
    },
  });
  expect(parsed).toMatchObject({
    paths: {
      '/user/list-for-router-with-path': {
        post: {
          operationId: 'UserListForRouterWithPath',
          parameters: [],
          responses: {
            '200': {
              description: '',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/UserListForRouterWithPathOutput',
                  },
                },
              },
            },
          },
          summary: '',
          tags: ['user'],
        },
      },
      '/src/endpoints/user/list/user-list-no-path': {
        post: {
          operationId: 'SrcEndpointsUserListUserListNoPath',
          parameters: [],
          responses: {
            '200': {
              description: '',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/SrcEndpointsUserListUserListNoPathOutput',
                  },
                },
              },
            },
          },
          summary: '',
          tags: ['src/endpoints/user/list'],
        },
      },
      '/user/list-with-path': {
        post: {
          operationId: 'UserListWithPath',
          parameters: [],
          responses: {
            '200': {
              description: '',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/UserListWithPathOutput',
                  },
                },
              },
            },
          },
          summary: '',
          tags: ['user'],
        },
      },
      '/user/list-with-path-no-suffix': {
        post: {
          operationId: 'UserListWithPathNoSuffix',
          parameters: [],
          responses: {
            '200': {
              description: '',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/UserListWithPathNoSuffixOutput',
                  },
                },
              },
            },
          },
          summary: '',
          tags: ['user'],
        },
      },
    },
  });
  // Search params are query parameters on any method; `input` stays the
  // body, and a GET has none.
  expect(parsed).toMatchObject({
    paths: {
      '/oauth/callback': {
        get: {
          operationId: 'OauthCallback',
          parameters: [
            {
              name: 'code',
              required: true,
              in: 'query',
              schema: { type: 'string', minLength: 1 },
            },
            {
              name: 'state',
              required: true,
              in: 'query',
              schema: { type: 'string' },
            },
            {
              name: 'expiresIn',
              required: true,
              in: 'query',
              schema: { type: 'integer' },
            },
          ],
        },
      },
      '/search': {
        post: {
          operationId: 'Search',
          parameters: [
            {
              name: 'page',
              required: false,
              in: 'query',
              schema: { type: 'integer', default: 1 },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SearchInput',
                },
              },
            },
          },
        },
      },
    },
  });
  expect(Object.keys(parsed.paths['/oauth/callback'])).toEqual(['get']);
  expect(parsed.paths['/oauth/callback'].get).not.toHaveProperty('requestBody');
});
