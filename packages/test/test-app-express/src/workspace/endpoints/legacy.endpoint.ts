import { Headers } from '@nestjs/common';
import { decorated, z } from 'nestjs-endpoints';
import { endpoint } from '../router.module';

export default endpoint.query({
  output: z.object({ tenant: z.string(), agent: z.string() }),
  injectAtRequest: { agent: decorated<string>(Headers('user-agent')) },
  handler: ({ tenant, agent }) => ({ tenant, agent }),
});
