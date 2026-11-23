import { EndpointRouter } from 'nestjs-endpoints';
import { OrderLog, OrderModule, recording } from './order';

// The top of a tree of three routers made with `child()`, and one made with `create()`
// under them: each records what it does, to show the order it does it in.
export default EndpointRouter.create({
  imports: [OrderModule],
  context: {
    inject: { log: OrderLog },
  },
  ...recording('company'),
});
