import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Module,
  NestInterceptor,
  Type,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
  EndpointsRouterModule,
  ZodValidationException,
} from 'nestjs-endpoints';
import { Observable, catchError, throwError } from 'rxjs';
import { ZodError } from 'zod';
import { AuthModule } from './auth/auth.module';
import {
  AppointmentRepositoryToken,
  IAppointmentRepository,
} from './endpoints/user/appointment/appointment-repository.interface';
import { AppointmentRepository } from './endpoints/user/appointment/appointment.repository';
import { UserRepository } from './endpoints/user/user.repository';
import {
  IUserRepository,
  UserRepositoryToken,
  UserService,
} from './endpoints/user/user.service';

@Injectable()
export class ZodErrorInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
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
    AuthModule,
    EndpointsRouterModule.register({
      rootDirectory: './endpoints',
      imports: [AuthModule],
      providers: [
        UserService,
        {
          provide: UserRepositoryToken,
          useClass: UserRepository as Type<IUserRepository>,
        },
        {
          provide: AppointmentRepositoryToken,
          useClass: AppointmentRepository as Type<IAppointmentRepository>,
        },
      ],
    }),
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ZodErrorInterceptor,
    },
  ],
})
export class AppModule {}
