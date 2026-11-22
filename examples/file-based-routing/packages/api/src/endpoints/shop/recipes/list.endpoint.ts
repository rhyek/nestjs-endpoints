import { endpoint, z } from 'nestjs-endpoints';
import { RecipesRepository } from './repository.service';

// POST /shop/recipes/list → client.shop.recipes.useList()
export default endpoint.query({
  output: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
    }),
  ),
  inject: {
    recipes: RecipesRepository,
  },
  handler: ({ recipes }) => recipes.list(),
});
