import { endpoint, z } from 'nestjs-endpoints';

// An input with each kind of field a form renders: a trimmed required
// string, a nullish one, an enum with a default, a nullable nested object
// shared as a component, and an array with a default.
export const profile = z.object({
  name: z.string().trim().min(1),
  nickname: z.string().nullish(),
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  address: z
    .object({ street: z.string(), city: z.string() })
    .meta({ id: 'ProfileAddress' })
    .nullable(),
  tags: z.array(z.string()).default([]),
});

export default endpoint.mutation({
  input: profile,
  output: profile,
  // Echoes the parsed input, so a caller sees what validation made of it.
  handler: ({ input }) => input,
});
