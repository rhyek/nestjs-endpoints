import { endpoint, z } from 'nestjs-endpoints';
import { RecipesRepository } from './repository.service';

export default endpoint.mutation({
  method: 'delete',
  params: z.object({
    recipeId: z.coerce.number(),
  }),
  output: z.object({
    id: z.number(),
    name: z.string(),
  }),
  inject: {
    recipesRepository: RecipesRepository,
  },
  handler: ({ params, recipesRepository }) => {
    return recipesRepository.remove(params.recipeId);
  },
});
