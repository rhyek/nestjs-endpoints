import { EndpointRouterModule } from 'nestjs-endpoints';
import { RecipesRepository } from './repository.service';

export default EndpointRouterModule.create({
  providers: [RecipesRepository],
  // Nested namespace segment — the full chain for endpoints under here
  // becomes ['shop', 'recipes'].
  namespace: true,
});
