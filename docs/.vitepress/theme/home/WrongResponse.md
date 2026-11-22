```ts twoslash
// @errors: 2322
// @filename: src/endpoints/orders/$orderId.view.sample.ts
import { endpoint, z } from 'nestjs-endpoints';
// ---cut---
export default endpoint.query({
  // ...
  output: z.object({
    id: z.number(),
    status: z.enum(['pending', 'paid', 'cancelled']),
  }),
  handler: () => ({
    id: 1,
    status: 'refunded',
  }),
});
```
