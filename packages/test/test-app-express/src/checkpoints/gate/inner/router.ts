import { CheckGuard, CheckInterceptor, Ledger } from '../../checks';
import gate from '../router';

// Lists a provider, a guard and an interceptor of the routers above it again: an instance of
// its own of each, made with what it provides.
export default gate.child({
  providers: [Ledger],
  guards: [CheckGuard],
  interceptors: [CheckInterceptor],
});
