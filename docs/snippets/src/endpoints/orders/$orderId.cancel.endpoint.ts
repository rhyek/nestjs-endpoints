import { endpoint, z } from 'nestjs-endpoints';
import { orderSchema } from './order.schema';
import { OrdersService } from './orders.service';

export default endpoint.mutation({
  params: z.object({ orderId: z.coerce.number() }),
  output: orderSchema,
  inject: { orders: OrdersService },
  handler: ({ params, orders }) => orders.cancel(params.orderId),
});
