import { EndpointRouter, z } from 'nestjs-endpoints';

// Not part of the app: it declares a path parameter that the URL of its
// endpoint does not have, which fails when it sets the endpoint up.
export default EndpointRouter.create({
  params: z.object({ venueId: z.uuid() }),
});
