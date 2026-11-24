import { Req } from '@nestjs/common';
import { decorated } from 'nestjs-endpoints';
import { CheckGuard, CheckInterceptor, type Checked } from '../checks';
import router from './router';

// Lists a guard and an interceptor of the routers above it again: an instance of its own of
// each, made with what its router provides.
export default router.endpoint.query({
  guards: [CheckGuard],
  interceptors: [CheckInterceptor],
  injectOnRequest: { request: decorated<Checked>(Req()) },
  handler: ({ request, ledger }) => ({ ledger: ledger.id, checks: request.checks ?? [] }),
});
