import { UseGuards, UseInterceptors } from '@nestjs/common';
import { recording } from '../../order';
import router from './router';

const option = recording('option');
const decorator = recording('decorator');

// Guards and interceptors in `guards` and `interceptors`, and more through `decorators`.
export default router.endpoint.query({
  guards: option.guards,
  interceptors: option.interceptors,
  decorators: [UseGuards(...decorator.guards), UseInterceptors(...decorator.interceptors)],
  handler() {
    this.log.entries.push('both handler');
    return null;
  },
});
