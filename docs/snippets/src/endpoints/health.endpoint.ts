import { endpoint, z } from 'nestjs-endpoints';

export default endpoint.query({
  method: 'get',
  output: z.object({ ok: z.boolean() }),
  handler: () => ({ ok: true }),
});
