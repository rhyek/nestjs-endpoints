import { hooks, KidGuard, KidInterceptor } from '../../../log';
import inner from '../router';

// Made with `child()`, under two made with `create()`.
export default inner.child({ guards: [KidGuard], interceptors: [KidInterceptor], ...hooks('kid') });
