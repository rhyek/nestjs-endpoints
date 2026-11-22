import { z } from 'nestjs-endpoints';
import router from '../router.module';

export default router.endpoint.query({
  output: z.object({ team: z.string() }),
  handler: ({ team }) => ({ team: team.name() }),
});
