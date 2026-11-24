import { EndpointRouter } from 'nestjs-endpoints';
import { badge } from '../checks';

// Made with `create()`: it inherits nothing, and the router above it applies its own.
export default EndpointRouter.create({ providers: [badge('annex')] });
