import { endpoint, z } from 'nestjs-endpoints';

export default endpoint({
  output: z.object({ ok: z.boolean() }),
  handler: () => ({ ok: true }),
});
