import { EndpointRouter } from 'nestjs-endpoints';
import { OriginGuard, OriginModule } from './tokens';

// Lists a guard that a module it imports provides and exports.
export default EndpointRouter.create({ imports: [OriginModule], guards: [OriginGuard] });
