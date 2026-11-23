import { Headers } from '@nestjs/common';
import { decorated, EndpointRouter } from 'nestjs-endpoints';
import { VenuesCountMiddleware } from './venues-count.middleware';
import { VenuesService } from './venues.service';

// The top of a tree of routers that hand their context down: the routers
// under it made with `child()` give their endpoints these injections too.
export default EndpointRouter.create({
  namespace: true,
  providers: [VenuesService],
  // For the router's own method and hook; the endpoints have theirs in `context`.
  inject: { venues: VenuesService },
  context: {
    inject: { venues: VenuesService },
    injectOnRequest: { tenant: decorated<string | undefined>(Headers('x-tenant')) },
  },
  // For every endpoint under this router, its own and those of the routers under it, but
  // one that a router two levels down serves.
  middleware: [VenuesCountMiddleware, { exclude: [':venueId/tables/:tableId/seat/:seat'] }],
  // A lifecycle hook and a method of the router, written as methods: `this`
  // has what the router injects into itself.
  methods: {
    open(router: string) {
      this.venues.opened.push(router);
    },
  },
  lifecycle: {
    onModuleInit() {
      this.open('venues');
    },
  },
});
