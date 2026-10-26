import { z } from 'nestjs-endpoints';
import router from '../router.module';

export const lead = router.endpoint.query({
  path: 'lead',
  output: z.object({ team: z.string(), lead: z.string() }),
  handler: ({ team }) => ({ team: team.name(), lead: 'ada' }),
});
