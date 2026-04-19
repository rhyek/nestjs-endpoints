import { EndpointRouterModule } from 'nestjs-endpoints';

// namespace: true → SDK bucket `api.shop.*` (inferred from folder name).
export default EndpointRouterModule.create({
  namespace: true,
  description:
    'Shop surface. Groups the storefront homepage, catering bookings, and the recipes sub-module.',
});
