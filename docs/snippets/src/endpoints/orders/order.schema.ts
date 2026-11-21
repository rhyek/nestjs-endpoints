import { z } from 'nestjs-endpoints';

export const orderSchema = z.object({
  id: z.number(),
  productId: z.string(),
  quantity: z.number(),
  status: z.enum(['pending', 'paid', 'cancelled']),
  total: z.number(),
});
