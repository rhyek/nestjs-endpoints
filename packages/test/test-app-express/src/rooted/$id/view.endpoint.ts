import { endpoint, z } from 'nestjs-endpoints';

// A path parameter at the root, beside the name `list`.
export default endpoint.query({
  params: z.object({ id: z.string() }),
  handler: ({ params }) => 'rooted view ' + params.id,
});
