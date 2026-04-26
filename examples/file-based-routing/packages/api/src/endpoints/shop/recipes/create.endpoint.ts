import { endpoint, z } from 'nestjs-endpoints';
import { RecipesRepository } from './repository.service';

// POST /shop/recipes/create → api.shop.recipes.useCreate()
export default endpoint({
  method: 'post',
  input: z.object({
    name: z.string().min(1),
  }),
  output: z.object({
    id: z.number(),
    name: z.string(),
  }),
  inject: {
    recipes: RecipesRepository,
  },
  handler: ({ input, recipes }) => recipes.add(input.name),
});
