import { endpoint, z } from 'nestjs-endpoints';
import { CartService } from '../cart.service';

export default endpoint({
  input: z.object({ item: z.string() }),
  output: z.object({ added: z.string() }),
  inject: { cart: CartService },
  handler: ({ input, cart }) => cart.add(input.item),
});
