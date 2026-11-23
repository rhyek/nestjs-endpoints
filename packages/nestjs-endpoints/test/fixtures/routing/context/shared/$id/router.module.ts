import { z } from 'zod';
import shared from '../router.module';
import { Visits, visitsProvider } from '../visits';

// Provides only what is its own: `Access` and the clock are its parent's.
export default shared.child({
  providers: [visitsProvider],
  inject: { visits: Visits },
  params: z.object({ id: z.coerce.number() }),
});
