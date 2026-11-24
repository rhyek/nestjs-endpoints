import { EndpointRouter } from 'nestjs-endpoints';
import { CartService } from './cart.service';

export default EndpointRouter.create({
  rootDirectory: 'endpoints',
  providers: [CartService],
  // Nested namespace under 'shop' → chain becomes ['shop', 'cart'].
  namespace: true,
});
