import { endpoint, z } from 'nestjs-endpoints';

export default endpoint({
  input: z.object({
    add: z.object({
      a: z.coerce.number(),
      b: z.coerce.number(),
    }),
  }),
  output: z.number(),
  handler: ({ input }) => {
    return input.add.a + input.add.b;
  },
});
