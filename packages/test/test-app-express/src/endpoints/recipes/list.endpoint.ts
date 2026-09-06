import { endpoint, z } from 'nestjs-endpoints';
import { RecipesRepository } from './repository.service';

export default endpoint({
  output: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
    }),
  ),
  inject: {
    recipesRepository: RecipesRepository,
  },
  handler: ({ recipesRepository }) => {
    return recipesRepository.recipes;
  },
});
