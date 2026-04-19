import { endpoint, z } from 'nestjs-endpoints';
import { RecipesRepository } from './repository.service';

export const createManualRecipeEndpoint = endpoint({
  path: 'create',
  input: z.object({
    name: z.string(),
  }),
  output: z.object({
    id: z.number(),
    name: z.string(),
    manual: z.boolean(),
  }),
  inject: {
    recipesRepository: RecipesRepository,
  },
  handler: ({ input, recipesRepository }) => {
    return recipesRepository.add(input.name);
  },
});
