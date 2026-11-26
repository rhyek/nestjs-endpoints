import { Req } from '@nestjs/common';
import { decorated } from 'nestjs-endpoints';
import type { Checked } from '../checkpoints/checks';
import router from './router';

export default router.endpoint.query({
  injectOnRequest: { request: decorated<Checked>(Req()) },
  handler: ({ request }) => ({ checks: request.checks ?? [] }),
});
