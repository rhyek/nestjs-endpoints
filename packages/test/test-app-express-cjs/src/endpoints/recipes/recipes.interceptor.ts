import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, defer, firstValueFrom } from 'rxjs';
import { TestAlsService } from './test-als.service';

@Injectable()
export class RecipesInterceptor implements NestInterceptor {
  constructor(public testAlsService: TestAlsService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    return defer(() =>
      this.testAlsService.run(async () => {
        console.log(
          `RecipesInterceptor before, uuid = ${this.testAlsService.getStore()}`,
        );
        const result = await firstValueFrom(next.handle());
        console.log(
          `RecipesInterceptor after, uuid = ${this.testAlsService.getStore()}`,
        );
        return result;
      }),
    );
  }
}
