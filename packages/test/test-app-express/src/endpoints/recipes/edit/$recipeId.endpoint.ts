import { endpoint, z } from 'nestjs-endpoints';
import { RecipesRepository } from '../repository.service';

export default endpoint({
  method: 'patch',
  params: z.object({
    recipeId: z.coerce.number(),
  }),
  input: z.object({
    name: z.string(),
  }),
  output: z.object({
    id: z.number(),
    name: z.string(),
  }),
  inject: {
    recipesRepository: RecipesRepository,
  },
  handler: ({ params, input, recipesRepository }) => {
    return recipesRepository.update(params.recipeId, input);
  },
});
