import { EndpointRouterModule } from 'nestjs-endpoints';
import { OrdersService } from './orders.service';

export default EndpointRouterModule.create({
  providers: [OrdersService],
  namespace: true,
  description: 'Placing and tracking orders.',
});
