import { Headers } from '@nestjs/common';
import { decorated, z } from 'nestjs-endpoints';
import { AuditService } from '../audit.service';
import router from '../router.module';

export default router.endpoint.query({
  output: z.object({
    workspace: z.string(),
    tenant: z.string(),
    agent: z.string(),
    audit: z.string(),
  }),
  inject: { audit: AuditService },
  injectOnRequest: { agent: decorated<string>(Headers('user-agent')) },
  handler: ({ workspace, tenant, agent, audit }) => ({
    workspace: workspace.name(),
    tenant,
    agent,
    audit: audit.trail(),
  }),
});
