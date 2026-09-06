import { endpoint, z } from 'nestjs-endpoints';

export default endpoint({
  output: z.object({ title: z.string() }),
  handler: () => ({ title: 'Hello' }),
});
