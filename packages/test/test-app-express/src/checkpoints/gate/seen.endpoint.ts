import { Req } from '@nestjs/common';
import { decorated } from 'nestjs-endpoints';
import type { Checked } from '../checks';
import router from './router';

export default router.endpoint.query({
  injectOnRequest: { request: decorated<Checked>(Req()) },
  handler: ({ request, ledger }) => ({ ledger: ledger.id, checks: request.checks ?? [] }),
});
