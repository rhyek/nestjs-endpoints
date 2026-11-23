import { CanActivate, Inject, Injectable, UseGuards } from '@nestjs/common';
import { OrderLog } from '../../order';
import router from './router';

@Injectable()
class EndpointGuard implements CanActivate {
  constructor(@Inject(OrderLog) private readonly log: OrderLog) {}

  canActivate() {
    this.log.entries.push('endpoint guard');
    return true;
  }
}

// A guard of its own: the handler's, after those of its routers.
export default router.endpoint.query({
  decorators: [UseGuards(EndpointGuard)],
  handler() {
    this.log.entries.push('guarded handler');
    return null;
  },
});
