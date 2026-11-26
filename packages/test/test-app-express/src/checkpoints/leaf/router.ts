import { badge, CheckGuard, CheckInterceptor } from '../checks';
import checkpoints from '../router';

// Lists a guard and an interceptor of the router above it again, and has no router under it.
export default checkpoints.child({
  providers: [badge('leaf')],
  guards: [CheckGuard],
  interceptors: [CheckInterceptor],
});
