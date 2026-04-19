import { endpoint, z } from 'nestjs-endpoints';
import { ShopService } from '../../shop.service';

export default endpoint({
  output: z.object({ code: z.string() }),
  inject: { shop: ShopService },
  handler: ({ shop }) => shop.promoToday(),
});
