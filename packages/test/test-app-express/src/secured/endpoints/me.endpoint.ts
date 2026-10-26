import { endpoint, z } from 'nestjs-endpoints';

export default endpoint.query({
  output: z.object({ ok: z.boolean() }),
  handler: () => ({ ok: true }),
});
