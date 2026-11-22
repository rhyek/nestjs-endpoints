import { endpoint, z } from 'nestjs-endpoints';

export default endpoint.query({
  path: '/user/list-for-router-with-path',
  output: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      email: z.string(),
    }),
  ),
  handler: () => [],
});
