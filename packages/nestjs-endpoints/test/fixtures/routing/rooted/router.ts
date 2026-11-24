import { EndpointRouter } from '../../../../src/endpoint-router';

// Looks for its endpoints, and the routers under it, in a folder beside it.
export default EndpointRouter.create({ rootDirectory: './endpoints' });
