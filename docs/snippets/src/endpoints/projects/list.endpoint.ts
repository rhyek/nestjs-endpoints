import { z } from 'nestjs-endpoints';
import router from './router.js';

export default router.endpoint.query({
  output: z.array(z.object({ id: z.string(), name: z.string() })),
  handler: ({ projects, user }) => projects.listFor(user.id),
});
