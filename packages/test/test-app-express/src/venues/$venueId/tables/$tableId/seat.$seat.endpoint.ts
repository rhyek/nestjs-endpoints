import { z } from 'nestjs-endpoints';
import router from '../router';

// Adds a parameter of its own, and declares `tableId` again: the endpoint's
// schema is the one that reads it.
export default router.endpoint.mutation({
  params: z.object({ tableId: z.string(), seat: z.coerce.number() }),
  output: z.object({ venueId: z.string(), tableId: z.string(), seat: z.number() }),
  handler: ({ params }) => params,
});
