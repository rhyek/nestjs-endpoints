import { endpoint, z } from 'nestjs-endpoints';

// Sibling to `homepage.endpoint.ts` so the React example can demonstrate
// both patterns: `api.shop.useHomepage()` (the hook) on the homepage
// and `api.useAxios().shop.stats()` (imperative via the bound axios
// client) on this one.
export default endpoint({
  output: z.object({
    visitors: z.number(),
  }),
  handler: () => ({ visitors: Math.floor(Math.random() * 1_000) }),
});
