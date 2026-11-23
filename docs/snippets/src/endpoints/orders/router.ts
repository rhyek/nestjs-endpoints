import { EndpointRouter } from 'nestjs-endpoints';
import { OrdersService } from './orders.service.js';

export default EndpointRouter.create({
  providers: [OrdersService],
  namespace: true,
  description: 'Placing and tracking orders.',
});
