import { Type } from '@nestjs/common';
import { EndpointsModule } from 'nestjs-endpoints';
import { AppointmentsModule } from './appointment/appointment.module';
import create from './create.endpoint';
import find from './find.endpoint';
import { UserRepository } from './user.repository';
import {
  IUserRepository,
  UserRepositoryToken,
  UserService,
} from './user.service';

@EndpointsModule({
  imports: [AppointmentsModule],
  endpoints: [create, find],
  providers: [
    {
      provide: UserRepositoryToken,
      useClass: UserRepository as Type<IUserRepository>,
    },
    UserService,
  ],
  exports: [UserService],
})
export class UserModule {}
