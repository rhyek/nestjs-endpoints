import { IncomingMessage, ServerResponse } from 'node:http';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { TestAlsService } from './test-als.service';

@Injectable()
export class RecipesMiddleware implements NestMiddleware {
  constructor(public testAlsService: TestAlsService) {}

  use(req: IncomingMessage, res: ServerResponse, next: () => void) {
    this.testAlsService.run(() => {
      console.log(
        `RecipesMiddleware before, uuid = ${this.testAlsService.getStore()}`,
      );
      res.on('finish', () => {
        console.log(
          `RecipesMiddleware after, uuid = ${this.testAlsService.getStore()}`,
        );
      });
      next();
    });
  }
}
