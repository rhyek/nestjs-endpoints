import { endpoint, z } from 'nestjs-endpoints';

// Demonstrates multiple path parameters in a single endpoint:
// folder layout `restaurant/$restaurantId/recipes/$recipeId.view/`
// → URL `restaurant/:restaurantId/recipes/:recipeId/view`.
export default endpoint({
  params: z.object({
    restaurantId: z.coerce.number(),
    recipeId: z.coerce.number(),
  }),
  output: z.object({
    restaurantId: z.number(),
    recipeId: z.number(),
  }),
  handler: ({ params }) => params,
});
