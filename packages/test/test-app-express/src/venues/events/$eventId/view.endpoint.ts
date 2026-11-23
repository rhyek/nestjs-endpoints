import { z } from 'nestjs-endpoints';
import router from '../router';

export default router.endpoint.query({
  output: z.object({ eventId: z.number(), inherited: z.array(z.string()) }),
  handler: (given) => ({
    eventId: given.params.eventId,
    inherited: ['venues', 'tenant'].filter((key) => key in given),
  }),
});
