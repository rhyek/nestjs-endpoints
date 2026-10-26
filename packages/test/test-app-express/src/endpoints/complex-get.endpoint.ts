import { endpoint, z } from 'nestjs-endpoints';

// A nested object in the search parameters (`?add[a]=5&add[b]=7`).
export default endpoint.query({
  method: 'get',
  query: z.object({
    add: z.object({
      a: z.coerce.number(),
      b: z.coerce.number(),
    }),
  }),
  output: z.number(),
  handler: ({ query }) => {
    return query.add.a + query.add.b;
  },
});
