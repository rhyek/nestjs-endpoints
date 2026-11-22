import { z } from 'nestjs-endpoints';
import { endpoint } from '../../router.module';

export default endpoint.query({
  output: z.object({
    workspace: z.string(),
    tenant: z.string().optional(),
  }),
  handler: ({ workspace, tenant }) => ({
    workspace: workspace.name(),
    tenant,
  }),
});
