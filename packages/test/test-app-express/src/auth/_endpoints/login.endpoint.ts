import { endpoint, z } from 'nestjs-endpoints';

export default endpoint.mutation({
  input: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
  output: z.object({
    token: z.string(),
  }),
  handler: () => {
    return {
      token: '123',
    };
  },
});
