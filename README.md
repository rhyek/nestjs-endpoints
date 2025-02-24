# nestjs-endpoints

![PR workflow](https://github.com/rhyek/nestjs-endpoints/actions/workflows/pr.yaml/badge.svg)

## Introduction

**nestjs-endpoints** is a tool for easily and succinctly writing HTTP APIs with NestJS inspired by the [REPR pattern](https://www.apitemplatepack.com/docs/introduction/repr-pattern/), the [Fast Endpoints](https://fast-endpoints.com/) .NET library, [tRPC](https://trpc.io/), and Next.js' file-based routing.

It features [zod](https://zod.dev/) input and output validation, comprehensive type-inference, and `@nestjs/swagger` + [nestjs-zod](https://github.com/BenLorantfy/nestjs-zod) to optionally automatically generate an OpenAPI spec file which can be used to then generate client SDKs using something like [orval](https://orval.dev/).

An endpoint can be as simple as this:

`src/hello-world.endpoint.ts`
```ts
export default endpoint({
  handler: () => 'Hello, World!',
});
```

```bash
❯ curl 'http://localhost:3000/hello-world'
Hello, World!%
```

## Features

- **Easy setup:** Automatically scans your entire project for endpoint files and loads them.
- **File-based routing:** Each endpoint's HTTP path is based on their path on disk.
- **User-Friendly API:** Supports both basic and advanced per-endpoint configuration.
- **Fully typed:** Compile and run-time validation of input and output values using Zod schemas.
- **HTTP adapter agnostic:** Works with both Express and Fastify NestJS applications.
- **Stable:** Produces regular **NestJS Controllers** under the hood.

## Getting Started

### Installation

```bash
npm install nestjs-endpoints @nestjs/swagger zod
```

### Setup

`src/app.module.ts`
```typescript
import { EndpointsRouterModule } from 'nestjs-endpoints';

@Module({
  imports: [
    EndpointsRouterModule.forRoot({
      rootDirectory: './endpoints',
      providers: [DbService], // available to all endpoints
    }),
  ],
})
export class AppModule {}
```

## Basic Usage

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
      // Removed during zod validation
      extra: 'This will be stripped',
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
-d '{"name": "Art", "emailTYPO": "art@vandelayindustries.com"}' | jq
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

## File-based routing

HTTP paths for endpoints are determined by looking at the file's absolute path on disk,
stripping `rootDirectory`, then removing any path segments that start with an underscore (`_`).
Filenames must either end in `.endpoint.ts` or be `endpoint.ts` (`js`, `cjs`, `mjs`, `mts` are also supported).

Examples (assume `rootDirectory` is `./endpoints`):

- `src/endpoints/user/find-all.endpoint.ts` -> `user/find-all`
- `src/endpoints/user/_mutations/create/endpoint.ts` -> `user/create`

> _**Note:**_ Bundled projects via Webpack or similar are not supported.

## Advanced Usage

Depending on the project's requirements, the above should ideally suffice most of the time. In case you need access to more of NestJS' features like Interceptors, Guards, access to the request object, etc, or if you'd rather have isolated NestJS modules per feature with their own providers, here is a more complete example:

> _**Note:**_ You are also welcome to use both NestJS Controllers and endpoints in the same project.

`src/app.module.ts`
```typescript
import { EndpointsRouterModule } from 'nestjs-endpoints';

@Module({
  imports: [
    EndpointsRouterModule.forRoot({
      rootDirectory: './',
      autoLoadEndpoints: false, // manually load endpoints
    }),
  ],
})
export class AppModule {}
```
`src/user/user.module.ts`
```typescript
import { EndpointsModule } from 'nestjs-endpoints';
import create from './appointment/_endpoints/create/endpoint';

@EndpointsModule({
  endpoints: [create],
  providers: [
    DbService,
    {
      provide: AppointmentRepositoryToken,
      useClass: AppointmentRepository as IAppointmentRepository,
    },
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

## OpenAPI, Codegen setup (optional)

It's a common practice to automatically generate a client SDK for your API that
you can use in other backend or frontend projects and have the benefit of full-stack type-safety. tRPC and similar libraries make this easy for you.

We can achieve the same here in two steps. We first build an OpenAPI document, then use that document's
output with [orval](https://orval.dev/):

`src/main.ts`
```typescript
import { setupOpenAPI } from 'nestjs-endpoints';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const { document, changed } = await setupOpenAPI(app, {
    configure: (builder) => builder.setTitle('My Api'),
    outputFile: 'openapi.json',
  });
  if (changed) {
    void import('orval').then(({ generate }) => {
      void generate();
    });
  }
  await app.listen(3000);
}
```
