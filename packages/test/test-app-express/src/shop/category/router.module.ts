import { EndpointsRouterModule } from 'nestjs-endpoints';
import { CategoryService } from './category.service';

export default EndpointsRouterModule.register({
  rootDirectory: 'endpoints',
  // basePath omitted — inferred as 'shop/category':
  //   parent shop's basePath ('shop') + this module's folder name ('category').
  providers: [CategoryService],
  namespace: true,
});
