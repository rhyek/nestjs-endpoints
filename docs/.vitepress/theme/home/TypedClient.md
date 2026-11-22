```tsx twoslash
// @noErrors
import { useApiClient } from './generated/react-query-client.js';
// ---cut---
// React Query
function Order({ orderId }) {
  // ...
  const client = useApiClient();
  const order = client.orders.useView({ path: { orderId } });

  order.data?.
  //          ^|
}
```
