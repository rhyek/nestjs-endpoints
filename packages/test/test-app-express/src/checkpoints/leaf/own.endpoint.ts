import { Req } from '@nestjs/common';
import { decorated } from 'nestjs-endpoints';
import { CheckGuard, CheckInterceptor, type Checked } from '../checks';
import router from './router';

// Lists the guard and the interceptor of its router again: an instance of its own of each.
export default router.endpoint.query({
  guards: [CheckGuard],
  interceptors: [CheckInterceptor],
  injectOnRequest: { request: decorated<Checked>(Req()) },
  handler: ({ request }) => ({ checks: request.checks ?? [] }),
});
