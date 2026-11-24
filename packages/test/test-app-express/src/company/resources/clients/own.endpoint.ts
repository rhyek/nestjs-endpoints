import { recording } from '../../order';
import router from './router';

const { guards, interceptors } = recording('endpoint');

// A guard and an interceptor of its own, in `guards` and `interceptors`.
export default router.endpoint.query({
  guards,
  interceptors,
  handler() {
    this.log.entries.push('own handler');
    return null;
  },
});
