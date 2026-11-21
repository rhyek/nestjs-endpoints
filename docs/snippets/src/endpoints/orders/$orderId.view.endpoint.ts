import { endpoint, z } from 'nestjs-endpoints';
import { orderSchema } from './order.schema';
import { OrdersService } from './orders.service';

export default endpoint.query({
  params: z.object({ orderId: z.coerce.number() }),
  output: orderSchema,
  inject: { orders: OrdersService },
  handler: ({ params, orders }) => orders.find(params.orderId),
});
