# nestjs-endpoints

![PR workflow](https://github.com/rhyek/nestjs-endpoints/actions/workflows/pr.yaml/badge.svg)

## Introduction

**nestjs-endpoints** is a lightweight tool for writing clean, succinct, end-to-end type-safe HTTP APIs with NestJS that encourages the [REPR](https://www.apitemplatepack.com/docs/introduction/repr-pattern/) design pattern, code colocation, and the Single Responsibility Principle.

It's inspired by the [Fast Endpoints](https://fast-endpoints.com/) .NET library, [tRPC](https://trpc.io/), and Next.js' file-based routing.

An endpoint can be as simple as this:

`src/greet.endpoint.ts`

```ts
export default endpoint({
  input: z.object({
    name: z.string(),
  }),
  output: z.string(),
  inject: {
    helloService: HelloService,
  },
  handler: ({ input, helloService }) => helloService.greet(input.name),
});
```

```bash
❯ curl 'http://localhost:3000/greet?name=Satie'
Hello, Satie!%
```

```ts
// axios client
const greeting = await client.greet({ name: 'Satie' });

// react-query client
const { data: greeting, error, status } = useGreet({ name: 'Satie' });
```

## Features

- **Stable:** Produces regular **NestJS Controllers** under the hood.
- **Automatic setup**:
  - Scans your project for endpoint files.
  - **File-based routing:** Endpoints' HTTP paths are based on their path on disk.
- **Traditional setup**: Explicitly set HTTP paths and import endpoints like regular controlllers.
- **Schema validation:** Compile and run-time validation of input and output values using Zod schemas.
- **End-to-end type safety:** Auto-generates `axios` and `@tanstack/react-query` client libraries. Internally uses `@nestjs/swagger`, [zod-openapi](https://github.com/samchungy/zod-openapi), and [orval](https://orval.dev/).
- **HTTP adapter agnostic:** Works with both Express and Fastify NestJS applications.
- **Supports CommonJS and ESM**

## Installation

```bash
npm install nestjs-endpoints @nestjs/swagger zod
```

## Setup

You can opt for either an automatic setup with endpoint scanning + file-based routing or a traditional one with manual imports and HTTP paths. You can also mix both in a single project.

### Option 1. Automatic setup

This is the preferred way of setting up nestjs-endpoints using file-based routing.

`src/app.module.ts`

```typescript
import { EndpointsRouterModule } from 'nestjs-endpoints';

@Module({
  imports: [
    EndpointsRouterModule.register({
      rootDirectory: './endpoints',
    }),
  ],
})
export class AppModule {}
```

`src/endpoints/status/health.ts`

```typescript
import { endpoint } from 'nestjs-endpoints';

export default endpoint({
  handler: () => 'ok',
});
```

Endpoint available at `/status/health`.

### Option 2. Traditional imports and paths

You can import endpoints like regular NestJS controllers. No need for `EndpointsRouterModule` in this case.

`src/app.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { healthCheck } from './health-check';

@Module({
  controllers: [healthCheck],
})
class AppModule {}
```

`src/health-check.ts`

```typescript
import { endpoint } from 'nestjs-endpoints';

export const healthCheck = endpoint({
  path: '/status/health',
  handler: () => 'ok',
});
```

Endpoint available at `/status/health`.

## Usage

`src/app.module.ts`

```typescript
import { EndpointsRouterModule } from 'nestjs-endpoints';

@Module({
  imports: [
    EndpointsRouterModule.register({
      rootDirectory: './endpoints',
      // available to all endpoints in this module
      providers: [DbService],
    }),
  ],
})
export class AppModule {}
```

`src/endpoints/user/find.endpoint.ts`

```typescript
import { endpoint, z } from 'nestjs-endpoints';

export default endpoint({
  input: z.object({
    // GET endpoints use query params for input,
    // so we need to coerce the string to a number
    id: z.coerce.number(),
  }),
  output: z
    .object({
      id: z.number(),
      name: z.string(),
      email: z.string().email(),
    })
    .nullable(),
  inject: {
    db: DbService,
  },
  // The handler's parameters are fully typed, and its
  // return value is type-checked against the output schema
  handler: ({ input, db }) => db.user.find(input.id),
});
```

`src/endpoints/user/create.endpoint.ts`

```typescript
import { endpoint, z } from 'nestjs-endpoints';

export default endpoint({
  method: 'post',
  input: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  output: z.object({
    id: z.number(),
  }),
  inject: {
    db: DbService,
  },
  handler: async ({ input, db }) => {
    const user = await db.user.create(input);
    return {
      id: user.id,
      // Stripped during zod validation
      name: user.name,
    };
  },
});
```

You call the above using:

```bash
❯ curl 'http://localhost:3000/user/find?id=1'
null%

# bad input
❯ curl -s -X 'POST' 'http://localhost:3000/user/create' \
-H 'Content-Type: application/json' \
-d '{"name": "Art", "emailTYPO": "art@gmail.com"}' | jq
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": [
        "email"
      ],
      "message": "Required"
    }
  ]
}

# success
❯ curl -X 'POST' 'http://localhost:3000/user/create' \
-H 'Content-Type: application/json' \
-d '{"name": "Art", "email": "art@vandelayindustries.com"}'
{"id":1}%
```

### File-based routing

HTTP paths for endpoints are derived from the file's path on disk:

- `rootDirectory` is trimmed from the start
- Optional `basePath` is prepended
- Path segments that begin with an underscore (`_`) are removed
- Filenames must either end in `.endpoint.ts` or be `endpoint.ts`
- `js`, `cjs`, `mjs`, `mts` are also supported.
- Route parameters are **not** suported (`user/:userId`)

Examples (assume `rootDirectory` is `./endpoints`):

- `src/endpoints/user/find-all.endpoint.ts` -> `user/find-all`
- `src/endpoints/user/_mutations/create/endpoint.ts` -> `user/create`

> _**Note:**_ Bundled projects via Webpack or similar are not supported.

## Codegen (optional)

You can automatically generate a client SDK for your API that can be used in other backend or frontend projects with the benefit of end-to-end type safety. It uses [orval](https://orval.dev/) internally and works with both scanned and manually imported endpoints.

### Using `setupCodegen`

This is the preferred way of configuring codegen with nestjs-endpoints.

`src/main.ts`

```typescript
import { setupCodegen } from 'nestjs-endpoints';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await setupCodegen(app, {
    clients: [
      {
        type: 'axios',
        outputFile: process.cwd() + '/generated/axios-client.ts',
      },
      {
        type: 'react-query',
        outputFile: process.cwd() + '/generated/react-query-client.tsx',
      },
    ],
  });
  await app.listen(3000);
}
```

### axios

```ts
import { createApiClient } from './generated/axios-client';

const client = createApiClient({
  baseURL: process.env.API_BASE_URL,
  headers: {
    'x-test': 'test-1',
  },
});
// Access to axios instance
client.axios.defaults.headers.common['x-test'] = 'test-2';

const { id } = await client.userCreate({
  name: 'Tom',
  email: 'tom@gmail.com',
});
```

### react-query

```typescript
import {
  ApiClientProvider,
  createApiClient,
} from './generated/react-query-client';

export function App() {
  const queryClient = useMemo(() => new QueryClient({}), []);
  const apiClient = useMemo(
    () =>
      createApiClient({
        baseURL: import.meta.env.VITE_API_BASE_URL,
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <UserPage />
      </ApiClientProvider>
    </QueryClientProvider>
  );
}
--
import {
  useUserCreate,
  useApiClient,
} from './generated/react-query-client';

export function UserPage() {
  // react-query mutation hook
  const userCreate = useUserCreate();
  const handler = () => userCreate.mutateAsync({ ... });

  // You can also use the api client, directly
  const client = useApiClient();
  const handler = () => client.userCreate({ ... });
  ...
}
```

More examples:

- [axios](https://github.com/rhyek/nestjs-endpoints/blob/f9fc77c0af9439e35e2ed3f26aa3e645795ed44f/packages/test/test-app-express-cjs/test/client.e2e-spec.ts#L15)
- [react-query](https://github.com/rhyek/nestjs-endpoints/tree/main/packages/test/test-react-query-client)

### Handling ZodEffects in output schemas

The following configuration will not work:

```typescript
export default endpoint({
  ...
  output: z.object({
    name: z.string()
      .transform((s) => s.toUpperCase())
  }),
  ...
})
```

The `.transform` creates a `ZodEffect` whos output type in some cases cannot be known at run-time (only compile-time), and an OpenApi schema cannot be inferred. More info [here](https://github.com/samchungy/zod-openapi?tab=readme-ov-file#effecttype).

To fix it, do the following:

```typescript
export default endpoint({
  ...
  output: z.object({
    name: z.string()
      .transform((s) => s.toUpperCase())
      .openapi({ effectType: 'same' }),
  }),
  ...
})
```

### Manual codegen with OpenAPI spec file

If you just need the OpenAPI spec file or prefer to configure orval or some other tool yourself, you can do the following:

`src/main.ts`

```typescript
import { setupOpenAPI } from 'nestjs-endpoints';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const { document, changed } = await setupOpenAPI(app, {
    configure: (builder) => builder.setTitle('My Api'),
    outputFile: process.cwd() + '/openapi.json',
  });
  if (changed) {
    void import('orval').then(({ generate }) => generate());
  }
  await app.listen(3000);
}
```

## Advanced Usage

When you need access to more of NestJS' features like Interceptors, Guards, access to the request object, etc, or if you'd rather have contained NestJS modules per feature with their own endpoints
and providers, here is a more complete example (view full example [here](https://github.com/rhyek/nestjs-endpoints/tree/main/packages/test/test-app-express-cjs)):

> _**Note:**_ You are also welcome to use both NestJS Controllers and endpoints in the same project.

`src/app.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { EndpointsRouterModule } from 'nestjs-endpoints';

@Module({
  imports: [
    // Contained user module with endpoints
    UserModule,
    // Other endpoints
    EndpointsRouterModule.register({
      rootDirectory: './endpoints',
      providers: [DbService],
    }),
  ],
  controllers: [healthCheck], // Mixed with manual imports
})
export class AppModule {}
```

`src/user/user.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { EndpointsRouterModule } from 'nestjs-endpoints';

@Module({
  imports: [
    EndpointsRouterModule.register({
      rootDirectory: './',
      basePath: 'user',
      providers: [
        DbService,
        {
          provide: AppointmentRepositoryToken,
          useClass: AppointmentRepository as IAppointmentRepository,
        },
      ],
    }),
  ],
})
export class UserModule {}
```

`src/user/appointment/_endpoints/create/endpoint.ts`

```typescript
import { Inject, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { decorated, endpoint, schema, z } from 'nestjs-endpoints';

export default endpoint({
  method: 'post',
  summary: 'Create an appointment',
  input: z.object({
    userId: z.number(),
    date: z.coerce.date(),
  }),
  output: {
    201: schema(
      z.object({
        id: z.number(),
        date: z.date().transform((date) => date.toISOString()),
        address: z.string(),
      }),
      {
        description: 'Appointment created',
      },
    ),
    400: z.union([
      z.string(),
      z.object({
        message: z.string(),
        errorCode: z.string(),
      }),
    ]),
  },
  decorators: [UseGuards(AuthGuard)],
  inject: {
    db: DbService,
    appointmentsRepository: decorated<IAppointmentRepository>(
      Inject(AppointmentRepositoryToken),
    ),
  },
  injectMethod: {
    req: decorated<Request>(Req()),
  },
  handler: async ({
    input,
    db,
    appointmentsRepository,
    req,
    response,
  }) => {
    const user = await db.find(input.userId);
    if (!user) {
      // Need to use response fn when multiple output status codes
      // are defined
      return response(400, 'User not found');
    }
    if (await appointmentsRepository.hasConflict(input.date)) {
      return response(400, {
        message: 'Appointment has conflict',
        errorCode: 'APPOINTMENT_CONFLICT',
      });
    }
    return response(
      201,
      await appointmentsRepository.create(
        input.userId,
        input.date,
        req.ip,
      ),
    );
  },
});
```

To call this endpoint:

```bash
❯ curl -X 'POST' 'http://localhost:3000/user/appointment/create' \
-H 'Content-Type: application/json' \
-H 'Authorization: secret' \
-d '{"userId": 1, "date": "2021-11-03"}'
{"id":1,"date":"2021-11-03T00:00:00.000Z","address":"::1"}%
```

## Testing

You can write end-to-end or integration tests for your endpoints.

### End-to-end tests

Use either the generated client libraries or regular HTTP requests using `supertest`.

```ts
test('client library', async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication();
  await app.init();
  await app.listen(0);
  const client = createApiClient({
    baseURL: await app.getUrl(),
  });
  await expect(client.userFind({ id: 1 })).resolves.toMatchObject({
    data: {
      id: 1,
      email: 'john@hotmail.com',
    },
  });
});

test('supertest', async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication();
  await request(app.getHttpServer())
    .get('/user/find?id=1')
    .expect(200)
    .then((resp) => {
      expect(resp.body).toMatchObject({
        id: 1,
        email: 'john@hotmail.com',
      });
    });
});
```

### Integration tests

You can also load individual endpoints without having to import your entire application.

```ts
import userFindEndpoint from 'src/endpoints/user/find.endpoint';

test('integration', async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    controllers: [userFindEndpoint],
    providers: [DbService],
  }).compile();
  const app = moduleFixture.createNestApplication();
  await app.init();
  const userFind = app.get(userFindEndpoint);
  await expect(userFind.invoke({ id: 1 })).resolves.toMatchObject({
    id: 1,
    email: 'john@hotmail.com',
  });
});
```
