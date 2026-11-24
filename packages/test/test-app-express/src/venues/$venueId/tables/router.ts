import { Headers } from '@nestjs/common';
import { decorated, z } from 'nestjs-endpoints';
import { VenuesService } from '../../venues.service';
import venue from '../router';
import { SeatingModule } from './seating';
import { TablesGuard } from './tables.guard';

// A grandchild: `tableId` adds to the `venueId` it inherits, and its
// `tenant` replaces the one the venues router injects.
export default venue.child({
  namespace: true,
  // For its endpoints that inject `SeatingNotifier`.
  imports: [SeatingModule],
  context: {
    params: z.object({ tableId: z.coerce.number() }),
    injectOnRequest: { tenant: decorated<string | undefined>(Headers('x-table-tenant')) },
  },
  guards: [TablesGuard],
  // The service the router two levels up provides, injected into this router itself.
  inject: { venues: VenuesService },
  properties: () => ({ name: 'tables' }),
  lifecycle: {
    onApplicationBootstrap() {
      this.venues.opened.push(this.name);
    },
  },
});
