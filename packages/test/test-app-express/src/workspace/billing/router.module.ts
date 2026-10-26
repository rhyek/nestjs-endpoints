import { EndpointRouterModule } from 'nestjs-endpoints';
import { BillingService } from './billing.service';

// Nested under the workspace router, whose injections it does not inherit.
export default EndpointRouterModule.create({
  rootDirectory: 'endpoints',
  namespace: true,
  providers: [BillingService],
  endpointConfig: { inject: { billing: BillingService } },
});
