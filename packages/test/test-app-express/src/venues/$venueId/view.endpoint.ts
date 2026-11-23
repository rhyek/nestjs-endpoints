import { z } from 'nestjs-endpoints';
import router from './router';

// Declares no params: `venueId` is its router's.
export default router.endpoint.query({
  output: z.object({ venueId: z.string(), venue: z.string(), tenant: z.string().optional() }),
  handler: ({ params, venues, tenant }) => ({
    venueId: params.venueId,
    venue: venues.nameOf(params.venueId),
    tenant,
  }),
});
