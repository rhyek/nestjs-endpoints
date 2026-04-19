import { EndpointsRouterModule } from 'nestjs-endpoints';

export default EndpointsRouterModule.register({
  rootDirectory: 'endpoints',
  // Explicit basePath overrides folder-name inference. Folder name is 'blog'
  // but we mount at '/articles' instead.
  basePath: 'articles',
});
