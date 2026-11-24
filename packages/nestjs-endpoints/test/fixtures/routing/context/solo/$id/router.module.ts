import { z } from 'zod';
import solo from '../router.module';

export default solo.child({
  context: {
    params: z.object({ id: z.coerce.number() }),
  },
});
