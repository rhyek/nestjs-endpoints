import { EndpointRouter } from 'nestjs-endpoints';
import { BillingService } from './billing.service';

// Nested under the workspace router, whose injections it does not inherit.
export default EndpointRouter.create({
  rootDirectory: 'endpoints',
  namespace: true,
  providers: [BillingService],
  inject: { billing: BillingService },
});
