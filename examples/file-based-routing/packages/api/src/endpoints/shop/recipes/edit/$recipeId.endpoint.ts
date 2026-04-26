import { endpoint, z } from 'nestjs-endpoints';
import { RecipesRepository } from '../repository.service';

// File:  shop/recipes/edit/$recipeId.endpoint.ts
// URL:   PATCH /shop/recipes/edit/:recipeId
// SDK:   api.shop.recipes.useEdit() — mutate with { recipeId, data: { name } }
export default endpoint({
  method: 'patch',
  params: z.object({
    recipeId: z.coerce.number(),
  }),
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
  handler: ({ params, input, recipes }) =>
    recipes.rename(params.recipeId, input.name),
});
