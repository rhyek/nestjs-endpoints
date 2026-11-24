import { Req } from '@nestjs/common';
import { decorated } from 'nestjs-endpoints';
import type { Checked } from '../checks';
import router from './router';

// Made with `create()`: none of the context above it, only the guards and interceptors.
export default router.endpoint.query({
  injectOnRequest: { request: decorated<Checked>(Req()) },
  handler: ({ request }) => ({ checks: request.checks ?? [] }),
});
