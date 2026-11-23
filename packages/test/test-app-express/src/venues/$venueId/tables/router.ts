import { Headers } from '@nestjs/common';
import { decorated, z } from 'nestjs-endpoints';
import venue from '../router';
import { TablesGuard } from './tables.guard';

// A grandchild: `tableId` adds to the `venueId` it inherits, and its
// `tenant` replaces the one the venues router injects.
export default venue.child({
  namespace: true,
  params: z.object({ tableId: z.coerce.number() }),
  injectOnRequest: { tenant: decorated<string | undefined>(Headers('x-table-tenant')) },
  guards: [TablesGuard],
  // `venues` is injected by the router two levels up; `name` is this router's own.
  properties: () => ({ name: 'tables' }),
  onApplicationBootstrap() {
    this.venues.opened.push(this.name);
  },
});
