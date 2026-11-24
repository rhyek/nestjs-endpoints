import { EndpointRouter } from 'nestjs-endpoints';
import { RecipesRepository } from './repository.service';

export default EndpointRouter.create({
  providers: [RecipesRepository],
  // Nested namespace segment — the full chain for endpoints under here
  // becomes ['shop', 'recipes'].
  namespace: true,
});
