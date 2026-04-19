import { EndpointsRouterModule } from 'nestjs-endpoints';
import { CartService } from './cart.service';

export default EndpointsRouterModule.register({
  rootDirectory: 'endpoints',
  providers: [CartService],
});
