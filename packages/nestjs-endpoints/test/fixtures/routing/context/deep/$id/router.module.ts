import { z } from 'zod';
import deep from '../router.module';

export default deep.child({
  params: z.object({ id: z.coerce.number() }),
});
