import { z } from 'nestjs-endpoints';
import router from './router.js';

export default router.endpoint.query({
  output: z.object({ id: z.string(), name: z.string() }),
  handler: ({ params, projects, user }) => projects.find(params.projectId, user.id),
});
