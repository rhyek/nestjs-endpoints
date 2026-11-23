import { EndpointRouter } from 'nestjs-endpoints';

// Not part of the app: the router in `lost/` is a child of another router,
// which fails when this one finds it.
export default EndpointRouter.create({});
