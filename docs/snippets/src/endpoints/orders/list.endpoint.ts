import { endpoint, z } from 'nestjs-endpoints';
import { orderSchema } from './order.schema';
import { OrdersService } from './orders.service';

export default endpoint.query({
  query: z.object({ page: z.coerce.number().default(1) }),
  input: z.object({
    status: z.enum(['pending', 'paid', 'cancelled']).optional(),
  }),
  output: z.array(orderSchema),
  inject: { orders: OrdersService },
  handler: ({ query, input, orders }) => orders.list(input.status, query.page),
});
