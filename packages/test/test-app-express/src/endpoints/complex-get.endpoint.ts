import { endpoint, z } from 'nestjs-endpoints';

// A nested object in the search parameters (`?add[a]=5&add[b]=7`), and an
// array (`?tags=a&tags=b`, or `?tags=a` for one).
export default endpoint.query({
  method: 'get',
  query: z.object({
    add: z.object({
      a: z.coerce.number(),
      b: z.coerce.number(),
    }),
    tags: z.array(z.string()).default([]),
  }),
  output: z.object({ sum: z.number(), tags: z.array(z.string()) }),
  handler: ({ query }) => ({ sum: query.add.a + query.add.b, tags: query.tags }),
});
