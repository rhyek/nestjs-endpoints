import { EndpointRouterModule } from 'nestjs-endpoints';
import { RecipesRepository } from './repository.service';

// Nested router: URL prefix becomes /shop/recipes and the SDK namespace
// chain becomes ['shop', 'recipes'] → `client.shop.recipes.*`.
export default EndpointRouterModule.create({
  providers: [RecipesRepository],
  namespace: true,
  description: 'Recipe catalog and authoring.',
});
