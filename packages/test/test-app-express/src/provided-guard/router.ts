import { EndpointRouter } from 'nestjs-endpoints';
import { RequestGuard } from '../checkpoints/checks';

// Provides a guard made for each request, and lists it as a guard too.
export default EndpointRouter.create({ providers: [RequestGuard], guards: [RequestGuard] });
