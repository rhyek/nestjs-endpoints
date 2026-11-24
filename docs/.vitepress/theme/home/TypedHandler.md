```ts twoslash
// @filename: src/endpoints/orders/list.sample.ts
import { endpoint, z } from 'nestjs-endpoints';
// ---cut---
export default endpoint.query({
  query: z.object({ page: z.coerce.number().default(1) }),
  input: z.object({
    status: z.enum(['pending', 'paid', 'cancelled']).optional(),
  }),
  // ...
  handler: ({ query, input }) => {
    //               ^?
    // ...
  },
});
```
