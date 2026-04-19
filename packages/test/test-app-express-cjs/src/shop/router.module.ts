import { EndpointsRouterModule } from 'nestjs-endpoints';
import { ShopService } from './shop.service';

export default EndpointsRouterModule.register({
  // Multi-root: 'endpoints' holds this router's own endpoint files;
  // 'category', 'cart', and 'recipes' each contain their own
  // `router.module.ts` and are auto-discovered as nested routers.
  rootDirectory: ['endpoints', 'category', 'cart', 'recipes'],
  // basePath intentionally omitted — inferred as 'shop' from this
  // router.module.ts file's containing folder.
  providers: [ShopService],
});
