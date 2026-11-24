import { EndpointRouter } from 'nestjs-endpoints';
import { ran } from '../../ran.middleware';

// Made with `create()`, with middleware and no endpoint of its own: only a child router.
export default EndpointRouter.create({ middleware: [ran('plain')] });
