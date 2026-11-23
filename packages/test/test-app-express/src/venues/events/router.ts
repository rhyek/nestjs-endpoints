import { EndpointRouter, z } from 'nestjs-endpoints';

// Nested under the venues router, but made with `create()`: it inherits
// nothing. It declares the parameter of the `$eventId` folder its endpoints
// are in.
export default EndpointRouter.create({
  context: {
    params: z.object({ eventId: z.coerce.number() }),
  },
});
