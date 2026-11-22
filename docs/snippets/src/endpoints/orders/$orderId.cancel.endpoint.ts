import { endpoint, z } from 'nestjs-endpoints';
import { orderSchema } from './order.schema.js';
import { OrdersService } from './orders.service.js';

export default endpoint.mutation({
  params: z.object({ orderId: z.coerce.number() }),
  output: orderSchema,
  inject: { orders: OrdersService },
  handler: ({ params, orders }) => orders.cancel(params.orderId),
});
