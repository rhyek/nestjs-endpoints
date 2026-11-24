import { EndpointRouter } from 'nestjs-endpoints';
import { ShopService } from './shop.service';

export default EndpointRouter.create({
  // Multi-root: 'endpoints' holds this router's own endpoint files;
  // 'category', 'cart', and 'recipes' each contain their own
  // `router.module.ts` and are auto-discovered as nested routers.
  rootDirectory: ['endpoints', 'category', 'cart', 'recipes'],
  // basePath intentionally omitted — inferred as 'shop' from this
  // router.module.ts file's containing folder.
  providers: [ShopService],
  // Namespace inference mirrors basePath: segment 'shop' is picked up
  // from this router.module.ts file's containing folder.
  namespace: true,
});
