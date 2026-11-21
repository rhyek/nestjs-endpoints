---
description: An endpoint's output schema — one response, a schema per status code, and transforms in output schemas.
---

# Responses

`output` is the Zod schema of an endpoint's response body. The compiler
[checks the handler's return value](./type-safety.md#the-return-value) against it, the response
is parsed with it before it is sent, and the [generated clients](../clients/codegen.md) take the
response's type from it.

Without `output`, the response is sent unvalidated and the generated client types it as `any`.

## One response

With a single schema, return the value. The endpoint answers `200`, whatever its method.

```ts twoslash
// @filename: src/endpoints/orders/$orderId.view.sample.ts
import { endpoint, z } from 'nestjs-endpoints';
import { OrdersService } from './orders.service';
// ---cut---
export default endpoint.query({
  params: z.object({ orderId: z.coerce.number() }),
  output: z.object({
    id: z.number(),
    status: z.enum(['pending', 'paid', 'cancelled']),
    total: z.number(),
  }),
  inject: { orders: OrdersService },
  // `orders.find()` returns more fields than `output` declares
  handler: ({ params, orders }) => orders.find(params.orderId),
});
```

Parsing strips the keys the schema doesn't declare, so a handler can return a whole record and
send only what `output` names. A return value that fails `output` is answered `500`.

## Several statuses

Give `output` a schema per status code, and return `response(status, body)`. The status must be
one `output` declares, and the body is type-checked against that status's schema.

```ts twoslash
// @filename: src/endpoints/appointments/create.sample.ts
import { endpoint, schema, z } from 'nestjs-endpoints';
declare class AppointmentsService {
  hasConflict(date: Date): Promise<boolean>;
  create(userId: number, date: Date): Promise<{ id: number; address: string }>;
}
// ---cut---
export default endpoint.mutation({
  input: z.object({
    userId: z.number(),
    date: z.coerce.date(),
  }),
  output: {
    201: schema(z.object({ id: z.number(), address: z.string() }), {
      description: 'Appointment created',
    }),
    409: z.object({
      message: z.string(),
      errorCode: z.string(),
    }),
  },
  inject: { appointments: AppointmentsService },
  handler: async ({ input, appointments, response }) => {
    if (await appointments.hasConflict(input.date)) {
      return response(409, {
        message: 'Appointment has conflict',
        errorCode: 'APPOINTMENT_CONFLICT',
      });
    }
    return response(201, await appointments.create(input.userId, input.date));
  },
});
```

`schema()` attaches a description to one status, for an
[OpenAPI document](../clients/openapi.md). In the generated client, a status outside the 2xx range is thrown as a
[`ResponseError`](../clients/axios.md#errors).

For failures that aren't part of an endpoint's documented responses, throw
[NestJS's HTTP exceptions](./nestjs.md#errors).

## Transforms in output schemas

The generated clients are typed from what an `output` schema produces, and a `.transform()` runs
code that can't be read for it. Use `.overwrite()` for a transform that keeps the type, or say what the
transform produces with `.meta()`:

```ts
// the same type in and out
z.string().overwrite((value) => value.toUpperCase());

// another type out: say which
z.date()
  .transform((date) => date.toISOString())
  .meta({ type: 'string', format: 'date-time' });
```
