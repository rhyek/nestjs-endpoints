import { EndpointsRouterModule } from 'nestjs-endpoints';
import { ShopService } from './shop.service';

export default EndpointsRouterModule.register({
  // Multi-root: 'endpoints' holds this router's own endpoint files;
  // 'category' and 'cart' each contain their own router.module.ts and
  // are treated as nested routers.
  rootDirectory: ['endpoints', 'category', 'cart'],
  // basePath intentionally omitted — inferred as 'shop' from this
  // router.module.ts file's containing folder.
  providers: [ShopService],
});
