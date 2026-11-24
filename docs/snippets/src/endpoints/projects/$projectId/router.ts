import { z } from 'nestjs-endpoints';
import projects from '../router.js';

export default projects.child({
  context: {
    params: z.object({ projectId: z.uuid() }),
  },
});
