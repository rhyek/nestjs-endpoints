import { EndpointRouter } from 'nestjs-endpoints';
import { OrderLog, OrderModule, recording } from '../../../order';

// Made with `create()`: it inherits nothing from the routers above it, which still apply
// their guards, interceptors and middleware to it, and start before it.
export default EndpointRouter.create({
  imports: [OrderModule],
  inject: { log: OrderLog },
  ...recording('archive'),
});
