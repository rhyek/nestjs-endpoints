import { endpoint, z } from 'nestjs-endpoints';

/**
 * All search params are optional, so the generated client method's request
 * argument is optional and the method can be called with no arguments at all.
 * Regression guard: the bound axios client must still be injected into the
 * (omitted) trailing config — see `bindClient` / `bindHook` in the codegen
 * runtime.
 */
export default endpoint.query({
  query: z.object({
    q: z.string().optional(),
  }),
  output: z.object({
    ok: z.boolean(),
    q: z.string().nullable(),
  }),
  handler: ({ query }) => ({ ok: true, q: query.q ?? null }),
});
