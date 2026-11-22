import { Headers } from '@nestjs/common';
import { decorated, EndpointRouterModule } from 'nestjs-endpoints';
import { AuditService } from './audit.service';
import { WorkspaceService } from './workspace.service';

// Injects into every endpoint it owns. Its endpoints use both ways of
// reaching the router's builder: `router.endpoint` through the default
// import, and the `endpoint` re-exported here.
const router = EndpointRouterModule.create({
  rootDirectory: ['endpoints', 'billing'],
  namespace: true,
  providers: [WorkspaceService, AuditService],
  endpointConfig: {
    inject: { workspace: WorkspaceService },
    injectOnRequest: { tenant: decorated<string>(Headers('x-tenant')) },
  },
});
export const { endpoint } = router;
export default router;
