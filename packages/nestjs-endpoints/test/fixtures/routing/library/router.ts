import { EndpointRouter } from '../../../../src/endpoint-router';

// A router as a library exports one: an app lists it in the `routers` of one of its own.
export default EndpointRouter.create({ namespace: true });
