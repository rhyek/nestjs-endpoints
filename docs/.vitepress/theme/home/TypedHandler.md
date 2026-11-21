```ts twoslash
// @filename: src/endpoints/orders/list.sample.ts
import { endpoint, z } from 'nestjs-endpoints';
import { orderSchema } from './order.schema';
import { OrdersService } from './orders.service';
// ---cut---
export default endpoint.query({
  query: z.object({ page: z.coerce.number().default(1) }),
  input: z.object({
    status: z.enum(['pending', 'paid', 'cancelled']).optional(),
  }),
  output: z.array(orderSchema),
  inject: { orders: OrdersService },
  handler: ({ input, query, orders }) =>
    //          ^?
    orders.list(input.status, query.page),
});
```
