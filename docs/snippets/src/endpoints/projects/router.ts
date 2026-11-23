import { decorated, EndpointRouter } from 'nestjs-endpoints';
import { CurrentUser, type User } from '../../auth/current-user.decorator.js';
import { ProjectsService } from './projects.service.js';

export default EndpointRouter.create({
  namespace: true,
  providers: [ProjectsService],
  inject: { projects: ProjectsService },
  injectOnRequest: { user: decorated<User>(CurrentUser()) },
});
