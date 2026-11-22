import { IncomingMessage, ServerResponse } from 'node:http';
import { EndpointsRouterModule } from 'nestjs-endpoints';
import { RecipesInterceptor } from './recipes.interceptor';
import { RecipesMiddleware } from './recipes.middleware';
import { RecipesRepository } from './repository.service';
import { TestAlsService } from './test-als.service';

export default EndpointsRouterModule.register({
  providers: [RecipesRepository, TestAlsService],
  middleware: [
    RecipesMiddleware,
    (_req: IncomingMessage, _res: ServerResponse, next: () => void) => {
      console.log('Recipes functional middleware');
      next();
    },
    { exclude: ['list'] },
  ],
  interceptors: [RecipesInterceptor],
});
