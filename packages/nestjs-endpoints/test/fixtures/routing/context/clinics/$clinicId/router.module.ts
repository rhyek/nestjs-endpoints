import { z } from 'zod';
import clinics from '../router.module';

export default clinics.child({
  params: z.object({ clinicId: z.uuid() }),
});
