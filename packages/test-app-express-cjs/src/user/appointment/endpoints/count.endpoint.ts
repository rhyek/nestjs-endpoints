import { Inject } from '@nestjs/common';
import { decorated, endpoint, z } from 'nestjs-endpoints';
import {
  AppointmentRepositoryToken,
  IAppointmentRepository,
} from '../appointment-repository.interface';

export default endpoint({
  input: z.object({
    userId: z.coerce.number(),
  }),
  output: z.number(),
  inject: {
    appointmentsRepository: decorated<IAppointmentRepository>(
      Inject(AppointmentRepositoryToken),
    ),
  },
  handler: ({ input, appointmentsRepository }) =>
    appointmentsRepository.count(input.userId),
});
