import { endpoint, z } from 'nestjs-endpoints';

export default endpoint({
  output: z.object({
    tagline: z.string(),
  }),
  handler: () => ({ tagline: 'Welcome to the shop!' }),
});
