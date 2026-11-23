import { z } from 'nestjs-endpoints';
import router from './router';

// A parameter under a name: `/names/extra/list` is this endpoint's, with `list` as the item.
export default router.endpoint.query({
  params: z.object({ item: z.string() }),
  handler: ({ params }) => 'item ' + params.item,
});
