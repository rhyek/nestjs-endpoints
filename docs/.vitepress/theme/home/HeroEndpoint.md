```ts twoslash
// @filename: src/endpoints/orders/create.sample.ts
// ---cut---
import { endpoint, z } from 'nestjs-endpoints';
import { DbService } from '../../db/db.service.js';
import { orders } from '../../db/schema.js';

export default endpoint.mutation({
  input: z.object({
    productId: z.string(),
    quantity: z.number().int().min(1),
  }),
  output: z.object({
    id: z.number(),
    status: z.enum(['pending', 'paid', 'cancelled']),
  }),
  inject: { db: DbService },
  handler: async ({ input, db }) => {
    const [order] = await db
      .insert(orders)
      .values(input)
      .returning();
    return order;
  },
});
```
