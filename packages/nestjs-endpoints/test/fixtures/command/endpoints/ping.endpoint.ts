import { z } from 'zod';
import { endpoint } from '../../../../src/endpoint-fn';

export default endpoint.query({
  output: z.object({ ok: z.boolean() }),
  handler: () => ({ ok: true }),
});
