import { endpoint, z } from 'nestjs-endpoints';
import { OrdersService } from './orders.service.js';

export default endpoint.mutation({
  input: z.object({
    productId: z.string(),
    quantity: z.number().int().min(1),
    notes: z.string().optional(),
  }),
  output: z.object({
    id: z.number(),
    status: z.enum(['pending', 'paid', 'cancelled']),
    total: z.number(),
  }),
  inject: { orders: OrdersService },
  handler: ({ input, orders }) => orders.create(input),
});
