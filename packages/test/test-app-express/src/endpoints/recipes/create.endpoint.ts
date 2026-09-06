import { endpoint, z } from 'nestjs-endpoints';
import { RecipesRepository } from './repository.service';

export default endpoint({
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
  handler: ({ input, recipesRepository }) => {
    return recipesRepository.add(input.name);
  },
});
