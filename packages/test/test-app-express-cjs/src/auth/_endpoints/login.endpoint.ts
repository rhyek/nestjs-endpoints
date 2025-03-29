import { endpoint, z } from 'nestjs-endpoints';

export default endpoint({
  method: 'post',
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
