import { endpoint, z } from 'nestjs-endpoints';

// Sibling to `homepage.endpoint.ts` so the React example can demonstrate
// both patterns side-by-side: `client.shop.useHomepage()` (the hook) on
// the homepage and `client.shop.stats()` (imperative via the bound
// axios client) on this one — both reached from the same `useApiClient()`.
export default endpoint({
  output: z.object({
    visitors: z.number(),
  }),
  handler: () => ({ visitors: Math.floor(Math.random() * 1_000) }),
});
