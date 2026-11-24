import { UseGuards, UseInterceptors } from '@nestjs/common';
import { recording } from '../../order';
import router from './router';

const { guards, interceptors } = recording('endpoint');

// The same guard and interceptor as `own.endpoint.ts`, through `decorators`.
export default router.endpoint.query({
  decorators: [UseGuards(...guards), UseInterceptors(...interceptors)],
  handler() {
    this.log.entries.push('decorated handler');
    return null;
  },
});
