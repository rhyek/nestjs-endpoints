import { z } from 'nestjs-endpoints';
import venues from '../router';
import { VenueScopeMiddleware } from './venue-scope.middleware';

// A child of the venues router, in the folder that names the path parameter
// it declares. It lists no provider: `VenuesService`, which its endpoints and
// its middleware need, is its parent's.
export default venues.child({
  context: {
    params: z.object({ venueId: z.uuid() }),
  },
  middleware: [VenueScopeMiddleware],
});
