import { EndpointRouter } from 'nestjs-endpoints';
import { createManualRecipeEndpoint } from './create.endpoint';
import { RecipesRepository } from './repository.service';

export const RecipesManualEndpointsRouterModule = EndpointRouter.create({
  providers: [RecipesRepository],
  basePath: 'recipes-manual-1',
  endpoints: [createManualRecipeEndpoint],
});
