import { forwardRef, Type } from '@nestjs/common';
import { EndpointsModule } from 'nestjs-endpoints';
import { UserModule } from '../user.module';
import {
  AppointmentRepositoryToken,
  type IAppointmentRepository,
} from './appointment-repository.interface';
import { AppointmentRepository } from './appointment.repository';
import count from './endpoints/count.endpoint';
import create from './endpoints/create/create.endpoint';

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
