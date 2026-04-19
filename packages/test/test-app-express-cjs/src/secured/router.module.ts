import { EndpointsRouterModule } from 'nestjs-endpoints';
import { SecretHeaderGuard } from './secret-header.guard';

export default EndpointsRouterModule.register({
  rootDirectory: 'endpoints',
  providers: [SecretHeaderGuard],
  guards: [SecretHeaderGuard],
});
