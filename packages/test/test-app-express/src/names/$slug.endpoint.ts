import { z } from 'nestjs-endpoints';
import router from './router';

// A parameter of an endpoint file, beside `list`, `extra/` and the controller at `legacy`.
export default router.endpoint.query({
  params: z.object({ slug: z.string() }),
  handler: ({ params }) => 'slug ' + params.slug,
});
