import { EndpointRouter } from 'nestjs-endpoints';
import { OrderLog, OrderModule, recording } from '../company/order';

// The tree the docs draw: a router, one made with its child(), and one endpoint under that
// one. Each router has a guard, an interceptor, middleware and the five lifecycle hooks.
export default EndpointRouter.create({
  imports: [OrderModule],
  context: { inject: { log: OrderLog } },
  ...recording('squads'),
});
