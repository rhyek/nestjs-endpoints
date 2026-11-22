import { endpoint, z } from 'nestjs-endpoints';
import { RecipesRepository } from '../repository.service';

export const recipeParams = z.object({
  recipeId: z.coerce.number(),
});

export const recipeInput = z.object({
  name: z.string(),
});

export default endpoint.mutation({
  method: 'patch',
  params: recipeParams,
  input: recipeInput,
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
