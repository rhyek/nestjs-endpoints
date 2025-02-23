import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Module,
  NestInterceptor,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
  EndpointsRouterModule,
  ZodValidationException,
} from 'nestjs-endpoints';
import { Observable, catchError, throwError } from 'rxjs';
import { ZodError } from 'zod';
import { TestModule } from './test/test.module';
import { UserModule } from './user/user.module';

@Injectable()
export class ZodErrorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error) => {
        if (error instanceof ZodError) {
          return throwError(() => new ZodValidationException(error));
        }
        return throwError(() => error);
      }),
    );
  }
}

@Module({
  imports: [
    EndpointsRouterModule.forRoot({
      rootDirectory: './',
      autoLoadEndpoints: false,
    }),
    UserModule,
    TestModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ZodErrorInterceptor,
    },
  ],
})
export class AppModule {}
