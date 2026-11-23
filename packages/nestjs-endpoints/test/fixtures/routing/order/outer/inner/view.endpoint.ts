import { UseGuards } from '@nestjs/common';
import { hooks, MethodGuard } from '../../log';
import router from './router';

// Its own guard is the handler's, apart from its routers'.
export default router.endpoint.query({
  decorators: [UseGuards(MethodGuard)],
  ...hooks('inner endpoint'),
  handler: () => null,
});
