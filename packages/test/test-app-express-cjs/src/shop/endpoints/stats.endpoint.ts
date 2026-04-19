import { endpoint, z } from 'nestjs-endpoints';
import { ShopService } from '../shop.service';

export default endpoint({
  output: z.object({ visitors: z.number() }),
  inject: { shop: ShopService },
  handler: ({ shop }) => shop.stats(),
});
