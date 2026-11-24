import { EndpointRouter } from 'nestjs-endpoints';
import { badge, CheckGuard, CheckInterceptor, Ledger, RequestGuard } from './checks';

// One instance of each of its providers, guards and interceptors, for every endpoint under it.
export default EndpointRouter.create({
  providers: [badge('checkpoints'), Ledger],
  guards: [CheckGuard, RequestGuard],
  interceptors: [CheckInterceptor],
  context: { inject: { ledger: Ledger } },
});
