import { decorated, endpoint, z } from 'nestjs-endpoints';
import {
  AppointmentRepositoryToken,
  IAppointmentRepository,
} from '../appointment-repository.interface';
import { Inject } from '@nestjs/common';

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
