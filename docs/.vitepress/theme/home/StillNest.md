```ts twoslash
// @filename: src/endpoints/orders/$orderId.refund.sample.ts
import { decorated, endpoint, z } from 'nestjs-endpoints';
import { AdminGuard } from '../../auth/admin.guard.js';
import { CurrentUser, type User } from '../../auth/current-user.decorator.js';
import { PaymentsService } from '../../payments/payments.service.js';
// ---cut---
export default endpoint.mutation({
  params: z.object({ orderId: z.coerce.number() }),
  input: z.object({ reason: z.string() }),
  output: z.object({ refunded: z.boolean() }),
  // Guards, as @UseGuards() takes them; interceptors too.
  guards: [AdminGuard],
  // Providers, as a constructor would inject them.
  inject: { payments: PaymentsService },
  // Per-request values, as parameter decorators would.
  injectOnRequest: { user: decorated<User>(CurrentUser()) },
  handler: ({ params, input, payments, user }) =>
    payments.refund(params.orderId, input.reason, user.id),
});
```
