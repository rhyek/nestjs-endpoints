import { endpoint, z } from 'nestjs-endpoints';

export const searchQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

export const searchInput = z.object({
  term: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

// A POST query: the filters travel in the body, paging in the search params.
export default endpoint.query({
  query: searchQuery,
  input: searchInput,
  output: z.object({
    term: z.string(),
    tags: z.array(z.string()),
    page: z.number(),
  }),
  handler: ({ query, input }) => ({ ...input, page: query.page }),
});
