import { endpoint, z } from 'nestjs-endpoints';

// A redirect target, so it must be a GET: the provider sends the browser
// here with `?code=...&state=...`.
export default endpoint.query({
  method: 'get',
  query: z.object({
    code: z.string().min(1),
    state: z.string(),
    // Search params arrive as strings.
    expiresIn: z.coerce.number().int().positive(),
  }),
  output: z.object({
    code: z.string(),
    state: z.string(),
    expiresIn: z.number(),
  }),
  handler: ({ query }) => query,
});
