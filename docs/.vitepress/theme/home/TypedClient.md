```tsx twoslash
// @noErrors
import { useApiClient } from './generated/react-query-client.js';
const orderId = 1;
// ---cut---
// React Query
const client = useApiClient();
const order = client.orders.useView({ path: { orderId } });

order.data?.
//          ^|
```
