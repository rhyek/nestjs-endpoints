import assert from 'node:assert';
import { Inject, Req, UseGuards } from '@nestjs/common';
import { decorated, endpoint, schema, z } from 'nestjs-endpoints';
import { AuthGuard } from '../../../../auth.guard';
import { UserService } from '../../../user.service';
import {
  AppointmentRepositoryToken,
  IAppointmentRepository,
} from '../../appointment-repository.interface';

export default endpoint({
  method: 'post',
  summary: 'Create an appointment',
  input: z.object({
    userId: z.number(),
    date: z.coerce.date(),
  }),
  output: {
    201: schema(
      z.object({
        id: z.number(),
        date: z.date().transform((date) => date.toISOString()),
        address: z.string(),
      }),
      {
        description: 'Appointment created',
      },
    ),
    400: z.union([
      z.string(),
      z.object({
        message: z.string(),
        errorCode: z.string(),
      }),
    ]),
  },
  decorators: [UseGuards(AuthGuard)],
  inject: {
    userService: UserService,
    appointmentsRepository: decorated<IAppointmentRepository>(
      Inject(AppointmentRepositoryToken),
    ),
  },
  injectMethod: {
    req: decorated<{ ip: string | undefined }>(Req()),
  },
  handler: ({ input, userService, appointmentsRepository, req, response }) => {
    assert(typeof req.ip === 'string');
    const user = userService.find(input.userId);
    if (!user) {
      return response(400, 'User not found');
    }
    if (appointmentsRepository.hasConflict(input.date)) {
      return response(400, {
        message: 'Appointment has conflict',
        errorCode: 'APPOINTMENT_CONFLICT',
      });
    }
    return response(
      201,
      appointmentsRepository.create(input.userId, input.date, req.ip),
    );
  },
});
