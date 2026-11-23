import { z } from 'nestjs-endpoints';
import router from './router';

// `/venues/reports/summary`: two segments from one file name, beside the `$venueId` folder,
// whose pattern reads `reports` as a venue's id.
export default router.endpoint.query({
  output: z.object({ venues: z.number() }),
  handler() {
    return { venues: this.venues.names().length };
  },
});
