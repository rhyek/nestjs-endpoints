import { EndpointRouter } from 'nestjs-endpoints';
import { CategoryService } from './category.service';

export default EndpointRouter.create({
  rootDirectory: 'endpoints',
  // basePath omitted — inferred as 'shop/category':
  //   parent shop's basePath ('shop') + this module's folder name ('category').
  providers: [CategoryService],
  namespace: true,
});
