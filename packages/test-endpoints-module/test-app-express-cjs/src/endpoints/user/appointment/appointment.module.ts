import { forwardRef, Type } from '@nestjs/common';
import { EndpointsModule } from 'nestjs-endpoints';
import { UserModule } from '../user.module';
import count from './_endpoints/count.endpoint';
import create from './_endpoints/create/endpoint';
import {
  AppointmentRepositoryToken,
  type IAppointmentRepository,
} from './appointment-repository.interface';
import { AppointmentRepository } from './appointment.repository';

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
