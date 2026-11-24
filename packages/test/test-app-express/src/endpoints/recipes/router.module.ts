import { IncomingMessage, ServerResponse } from 'node:http';
import { EndpointRouter } from 'nestjs-endpoints';
import { RecipesInterceptor } from './recipes.interceptor';
import { RecipesMiddleware } from './recipes.middleware';
import { RecipesRepository } from './repository.service';
import { TestAlsService } from './test-als.service';

export default EndpointRouter.create({
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
