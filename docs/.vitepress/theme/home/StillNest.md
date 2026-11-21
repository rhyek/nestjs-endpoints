```ts twoslash
// @filename: src/endpoints/admin/refund.sample.ts
import { UseGuards } from '@nestjs/common';
import { decorated, endpoint, z } from 'nestjs-endpoints';
import { AdminGuard } from '../../auth/admin.guard';
import { CurrentUser, type User } from '../../auth/current-user.decorator';
import { PaymentsService } from '../../payments/payments.service';
// ---cut---
export default endpoint.mutation({
  input: z.object({ orderId: z.number(), reason: z.string() }),
  output: z.object({ refunded: z.boolean() }),
  // Any method decorator: guards, interceptors, metadata.
  decorators: [UseGuards(AdminGuard)],
  // Providers, as a constructor would inject them.
  inject: { payments: PaymentsService },
  // Per-request values, as parameter decorators would.
  injectOnRequest: { user: decorated<User>(CurrentUser()) },
  handler: ({ input, payments, user }) =>
    payments.refund(input.orderId, input.reason, user.id),
});
```
