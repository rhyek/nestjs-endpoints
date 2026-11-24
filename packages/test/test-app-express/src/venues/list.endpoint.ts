import { z } from 'nestjs-endpoints';
import router from './router';

export default router.endpoint.query({
  output: z.object({ venues: z.array(z.string()), tenant: z.string().optional() }),
  handler: ({ venues, tenant }) => ({ venues: venues.names(), tenant }),
});
