```ts twoslash
// @errors: 2322
import { createApiClient } from './generated/axios-client';
// ---cut---
// axios
const client = createApiClient({ baseURL: '/api' });

await client.orders.create({
  body: { productId: 'sku_42', quantity: '2' },
});
```
