import { EndpointRouter } from 'nestjs-endpoints';

// namespace: true → SDK bucket `client.shop.*` (inferred from folder name).
export default EndpointRouter.create({
  namespace: true,
  description:
    'Shop surface. Groups the storefront homepage, catering bookings, and the recipes sub-module.',
});
