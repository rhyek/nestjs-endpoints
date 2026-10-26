import { z } from 'nestjs-endpoints';
import router from '../router.module';

export default router.endpoint.query({
  output: z.object({ billing: z.string(), hasWorkspace: z.boolean() }),
  handler: (params) => ({
    billing: params.billing.name(),
    hasWorkspace: 'workspace' in params,
  }),
});
