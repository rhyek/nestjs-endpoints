import { endpoint, z } from 'nestjs-endpoints';
import { RecipesRepository } from '../repository.service';

export default endpoint({
  params: z.object({
    recipeId: z.coerce.number(),
  }),
  output: z.object({
    id: z.number(),
    name: z.string(),
    ingredients: z.array(z.string()),
  }),
  inject: {
    recipesRepository: RecipesRepository,
  },
  handler: ({ params, recipesRepository }) => {
    return recipesRepository.find(params.recipeId);
  },
});
