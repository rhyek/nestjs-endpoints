import { EndpointRouterModule } from 'nestjs-endpoints';
import { RecipesRepository } from './repository.service';

export default EndpointRouterModule.create({
  providers: [RecipesRepository],
});
