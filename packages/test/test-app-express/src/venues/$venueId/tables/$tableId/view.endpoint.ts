import { z } from 'nestjs-endpoints';
import router from '../router';

export default router.endpoint.query({
  output: z.object({
    venueId: z.string(),
    tableId: z.number(),
    venue: z.string(),
    tenant: z.string().optional(),
  }),
  handler: ({ params, venues, tenant }) => ({
    venueId: params.venueId,
    tableId: params.tableId,
    venue: venues.nameOf(params.venueId),
    tenant,
  }),
});
