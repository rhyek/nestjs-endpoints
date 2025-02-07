import { forwardRef, Type } from '@nestjs/common';
import { EndpointsModule } from 'nestjs-endpoints';
import { UserModule } from '../user.module';
import { AppointmentRepository } from './appointment.repository';
import {
  AppointmentRepositoryToken,
  type IAppointmentRepository,
} from './appointment-repository.interface';
import create from './endpoints/create/create.endpoint';
import count from './endpoints/count.endpoint';

@EndpointsModule({
  imports: [forwardRef(() => UserModule)],
  endpoints: [create, count],
  providers: [
    {
      provide: AppointmentRepositoryToken,
      useClass: AppointmentRepository as Type<IAppointmentRepository>,
    },
  ],
})
export class AppointmentsModule {}
