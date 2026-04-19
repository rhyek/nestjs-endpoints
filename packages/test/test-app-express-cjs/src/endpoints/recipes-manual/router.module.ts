import { EndpointsRouterModule } from 'nestjs-endpoints';
import { createManualRecipeEndpoint } from './create.endpoint';
import { RecipesRepository } from './repository.service';

export const RecipesManualEndpointsRouterModule =
  EndpointsRouterModule.register({
    providers: [RecipesRepository],
    basePath: 'recipes-manual-1',
    endpoints: [createManualRecipeEndpoint],
  });
