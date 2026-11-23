import { EndpointRouter } from '../../../../../src/endpoint-router';
import { hooks, OuterGuard, OuterInterceptor } from '../log';

// Found by the router of a test; the routers under it are made with `create()` and, one of
// them, with `child()`.
export default EndpointRouter.create({
  guards: [OuterGuard],
  interceptors: [OuterInterceptor],
  ...hooks('outer'),
});
