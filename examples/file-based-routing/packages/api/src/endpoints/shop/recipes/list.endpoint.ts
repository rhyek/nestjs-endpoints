import { endpoint, z } from 'nestjs-endpoints';
import { RecipesRepository } from './repository.service';

// GET /shop/recipes/list → api.shop.recipes.useList()
export default endpoint({
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
