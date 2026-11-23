import { z } from 'zod';
import router from './router';

// With a path parameter: it refuses a name beside it before any guard of its routers.
export default router.endpoint.query({
  params: z.object({ item: z.string() }),
  handler: () => null,
});
