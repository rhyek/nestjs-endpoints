import { z } from 'zod';
import deep from '../router.module';

export default deep.child({
  context: {
    params: z.object({ id: z.coerce.number() }),
  },
});
