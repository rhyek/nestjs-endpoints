# nestjs-endpoints

![PR workflow](https://github.com/rhyek/nestjs-endpoints/actions/workflows/pr.yaml/badge.svg)

## Introduction

**nestjs-endpoints** is a tool for easily and succinctly writing HTTP APIs with NestJS inspired by the [REPR pattern](https://www.apitemplatepack.com/docs/introduction/repr-pattern/), the [Fast Endpoints](https://fast-endpoints.com/) .NET library, and [tRPC](https://trpc.io/).

It utilizes file-based routing, [zod](https://zod.dev/) input and output validation, comprehensive type-inference, and `@nestjs/swagger` + [nestjs-zod](https://github.com/BenLorantfy/nestjs-zod) to speed up development and automatically generate an OpenAPI spec file which can be used to then generate client SDKs using something like [orval](https://orval.dev/).

## Features

- **Easy Setup:** Quick and simple installation process.
- **User-Friendly API:** Supports file-based routing and both basic and advanced per-endpoint configuration.
- **Fully Typed:** Compile and run-time validation of input and output values using Zod schemas.
- **HTTP Adapter agnostic:** Works with both Express and Fastify NestJS applications.
- **Stable:** Fully-tested for \*nix systems and produces regular NestJS Controllers under the hood.

## Setup Instructions

### Installation

```bash
npm install nestjs-endpoints @nestjs/swagger zod
```

### Setup

```typescript
// src/main.ts
import { setupEndpoints } from 'nestjs-endpoints';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const { document, changed } = await setupEndpoints(app, {
    openapi: {
      outputFile: 'openapi.json',
    },
  });
  // optional: Generate client SDK with orval using
  // the above openapi.json
  if (changed) {
    await import('orval').then(({ generate }) => {
      void generate();
    });
  }
  await app.listen(3000);
}
```

## Basic usage

```typescript
// src/user/find.endpoint.ts
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
      email: z.string(),
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

```typescript
// src/user/create.endpoint.ts
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
  handler: ({ input, db }) => ({
    id: db.user.create(input).id,
    extra: 'This will be stripped', // Removed during zod validation
  }),
});
```

```typescript
// src/user/user.module.ts
import { EndpointsModule } from 'nestjs-endpoints';
import create from './create.endpoint';
import find from './find.endpoint';

@EndpointsModule({
  endpoints: [create, find],
  // ...
})
export class UserModule {}
```

You can call the above using:

```bash
❯ curl 'http://localhost:3000/user/find?id=1'
null%

❯ curl -X 'POST' 'http://localhost:3000/user/create' \
-H 'Content-Type: application/json' \
-d '{"name": "Art", "email": "art@vandelayindustries.com"}'
{"id":1}%
```

### File-based routing

File-based routing works using a naming convention consisting of `*.module.ts` and `*.endpoint.ts` files and their location relative to each other. The http path will resemble the folder structure, but you need a `*.module.ts` with an `EndpointsModule` inside each folder you want to include as an http path segment.

Bundled projects via Webpack or similar are not supported.

## Advanced usage

Depending on the project's requirements, the above should ideally suffice most of the time. In case you need access to more of NestJS' features like Interceptors, Guards, access to the request object, etc, here is a more complete example:

> Note: You are also welcome to use both NestJS Controllers and endpoints in the same project.

> Assume `src/user/user.module.ts` and `src/user/appointment/appointment.module.ts` files exist.

```typescript
// src/user/appointment/endpoints/create/create.endpoint.ts
import assert from 'node:assert';
import { Inject, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { decorated, endpoint, schema, z } from 'nestjs-endpoints';
import { AuthGuard } from '../../../../auth.guard';
import { DbService } from '../../../../db.service';
import {
  AppointmentRepositoryToken,
  IAppointmentRepository,
} from '../../appointment-repository.interface';

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
    assert(typeof req.ip === 'string');
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

To call it:

```bash
❯ curl -X 'POST' 'http://localhost:3000/user/appointment/create' \
-H 'Content-Type: application/json' \
-H 'Authorization: secret' \
-d '{"userId": 1, "date": "2021-11-03"}'
{"id":1,"date":"2021-11-03T00:00:00.000Z","address":"::1"}%
```
