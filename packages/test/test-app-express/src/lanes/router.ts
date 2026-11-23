import { EndpointRouter } from 'nestjs-endpoints';
import { ran } from '../ran.middleware';

// The top of a tree for what a router's middleware runs for. It leaves three routes out: one
// of its own, given with a slash; one of a child; one of a router two routers down, under
// one made with `create()`.
export default EndpointRouter.create({
  endpoints: () => [import('./listed')],
  middleware: [ran('lanes'), { exclude: ['/open', ':id/inner/skip', 'plain/kid/skipped'] }],
});
