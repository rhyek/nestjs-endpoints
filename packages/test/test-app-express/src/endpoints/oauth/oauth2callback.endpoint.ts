import { endpoint, z } from 'nestjs-endpoints';

// A digit followed by a lowercase letter: the generated client must name the
// operation as Kubb does (`oauthOauth2Callback`).
export default endpoint.query({
  method: 'get',
  query: z.object({ code: z.string() }),
  output: z.object({ code: z.string() }),
  handler: ({ query }) => query,
});
