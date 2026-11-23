import { EndpointRouter } from '../../../../../../src/endpoint-router';
import { hooks, InnerGuard } from '../../log';

// Made with `create()` under a router made with `create()`.
export default EndpointRouter.create({ guards: [InnerGuard], ...hooks('inner') });
