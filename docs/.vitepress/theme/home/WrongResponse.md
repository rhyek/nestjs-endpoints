```ts twoslash
// @errors: 2322
// @filename: src/endpoints/orders/$orderId.view.sample.ts
import { endpoint, z } from 'nestjs-endpoints';
// ---cut---
export default endpoint.query({
  params: z.object({ orderId: z.coerce.number() }),
  output: z.object({
    id: z.number(),
    status: z.enum(['pending', 'paid', 'cancelled']),
    total: z.number(),
  }),
  handler: ({ params }) => ({
    id: params.orderId,
    status: 'refunded',
    total: 25,
  }),
});
```
