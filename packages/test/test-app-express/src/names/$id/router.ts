import { z } from 'nestjs-endpoints';
import { ran } from '../../ran.middleware';
import names from '../router';
import { GuardedGuard } from './guarded.guard';

// The parameter of a router, in the folder that names it.
export default names.child({
  context: {
    params: z.object({ id: z.string() }),
  },
  middleware: [ran('id')],
  guards: [GuardedGuard],
});
