import { endpoint, z } from 'nestjs-endpoints';
import { RecipesRepository } from './repository.service';

// Filename is exactly `endpoint.ts` → path inferred from the containing
// folder only (e.g. `/shop/recipes`), with no leaf segment appended.
export default endpoint({
  output: z.array(z.object({ id: z.number(), name: z.string() })),
  inject: { recipes: RecipesRepository },
  handler: ({ recipes }) => recipes.list(),
});
