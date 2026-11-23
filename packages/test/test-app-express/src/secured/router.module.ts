import { EndpointRouter } from 'nestjs-endpoints';
import { SecretHeaderGuard } from './secret-header.guard';

export default EndpointRouter.create({
  rootDirectory: 'endpoints',
  providers: [SecretHeaderGuard],
  guards: [SecretHeaderGuard],
  namespace: true,
});
