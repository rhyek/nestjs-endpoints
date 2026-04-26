import { endpoint, z } from 'nestjs-endpoints';

// No router.module.ts at `catering/`, so this endpoint inherits the
// parent shop router's namespace chain. `catering` contributes to the
// URL (/shop/catering/book) but not to the SDK tree — the generated
// hook lands at `api.shop.useCateringBook()`.
export default endpoint({
  method: 'post',
  input: z.object({
    email: z.email(),
    date: z.coerce.date(),
  }),
  output: z.object({
    confirmed: z.boolean(),
    for: z.string(),
    on: z.string(),
  }),
  handler: ({ input }) => ({
    confirmed: true,
    for: input.email,
    on: input.date.toISOString().slice(0, 10),
  }),
});
