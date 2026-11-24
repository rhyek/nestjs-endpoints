import { z } from 'nestjs-endpoints';
import { recording } from '../../company/order';
import squads from '../router';

export default squads.child({
  context: { params: z.object({ squadId: z.string() }) },
  ...recording('squad'),
});
