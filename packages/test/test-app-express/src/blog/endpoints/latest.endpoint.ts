import { endpoint, z } from 'nestjs-endpoints';

export default endpoint.query({
  output: z.object({ title: z.string() }),
  handler: () => ({ title: 'Hello' }),
});
