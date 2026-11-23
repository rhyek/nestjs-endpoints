import { z } from 'nestjs-endpoints';
import router from './router.js';

export default router.endpoint.mutation({
  params: z.object({ taskId: z.coerce.number() }),
  output: z.object({ done: z.boolean() }),
  handler: ({ params, projects, user }) =>
    projects.completeTask(params.projectId, params.taskId, user.id),
});
