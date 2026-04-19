import { EndpointsRouterModule } from 'nestjs-endpoints';

export default EndpointsRouterModule.register({
  rootDirectory: 'endpoints',
  // Explicit basePath overrides folder-name inference. Folder name is 'blog'
  // but we mount at '/articles' instead.
  basePath: 'articles',
  // `namespace: true` with an explicit basePath mirrors the basePath
  // value — segment becomes 'articles', not 'blog'.
  namespace: true,
});
