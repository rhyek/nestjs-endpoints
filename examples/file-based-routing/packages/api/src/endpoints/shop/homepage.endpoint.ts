import { endpoint, z } from 'nestjs-endpoints';

export default endpoint.query({
  output: z.object({
    tagline: z.string(),
  }),
  handler: () => ({ tagline: 'Welcome to the shop!' }),
});
