```tsx twoslash
// @noErrors
import { useApiClient } from './generated/react-query-client.js';
// ---cut---
// React Query
function Orders() {
  const client = useApiClient();
  const orders = client.orders.useList({
    query: { page: 1 },
    body: { status: 'paid' },
  });

  return (
    <ul>
      {orders.data?.map((order) => (
        <li key={order.id}>{order.}</li>
      //                          ^|
      ))}
    </ul>
  );
}
```
