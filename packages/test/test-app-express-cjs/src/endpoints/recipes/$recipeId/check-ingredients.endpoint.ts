import { endpoint, z } from 'nestjs-endpoints';
import { RecipesRepository } from '../repository.service';

export default endpoint({
  method: 'post',
  params: z.object({
    recipeId: z.coerce.number(),
  }),
  input: z.object({
    available: z.array(z.string()),
  }),
  output: z.object({
    missing: z.array(z.string()),
    ok: z.boolean(),
  }),
  inject: {
    recipesRepository: RecipesRepository,
  },
  handler: ({ params, input, recipesRepository }) => {
    const recipe = recipesRepository.find(params.recipeId);
    const missing = recipe.ingredients.filter(
      (i) => !input.available.includes(i),
    );
    return { missing, ok: missing.length === 0 };
  },
});
