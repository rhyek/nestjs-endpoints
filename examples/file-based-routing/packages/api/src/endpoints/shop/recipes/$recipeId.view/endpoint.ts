import { endpoint, z } from 'nestjs-endpoints';
import { RecipesRepository } from '../repository.service';

// File-based routing: a `$`-prefixed segment becomes a path parameter
// and a `.` inside one filename/folder splits into multiple URL segments.
// Folder: shop/recipes/$recipeId.view/  →  URL: /shop/recipes/:recipeId/view
// SDK:    api.shop.recipes.useView(recipeId)
//         — `:recipeId` drops out of the method name; the typed first arg
//           conveys it.
export default endpoint({
  params: z.object({
    // Path params arrive as strings — coerce to the type you want.
    recipeId: z.coerce.number(),
  }),
  output: z.object({
    id: z.number(),
    name: z.string(),
  }),
  inject: {
    recipes: RecipesRepository,
  },
  handler: ({ params, recipes }) => recipes.find(params.recipeId),
});
