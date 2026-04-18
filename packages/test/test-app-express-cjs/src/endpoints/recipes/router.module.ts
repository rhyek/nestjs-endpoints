import { EndpointsRouterModule } from 'nestjs-endpoints';
import { RecipesRepository } from './repository.service';

export default EndpointsRouterModule.register({
  providers: [RecipesRepository],
});
