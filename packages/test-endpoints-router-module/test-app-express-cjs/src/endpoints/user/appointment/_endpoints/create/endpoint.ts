import assert from 'node:assert';
import { Inject, Req, UseGuards } from '@nestjs/common';
import { decorated, endpoint, schema, z } from 'nestjs-endpoints';
import { AuthGuard } from '../../../../../auth.guard';
import { CurrentUser } from '../../../../../decorators/current-user.decorator';
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
    currentUser: decorated<{ name: string; isSuperAdmin: boolean }>(
      CurrentUser(),
    ),
    req: decorated<{ ip: string | undefined }>(Req()),
  },
  handler: async ({
    input,
    userService,
    appointmentsRepository,
    currentUser,
    req,
    response,
  }) => {
    assert(typeof req.ip === 'string');
    assert(currentUser.isSuperAdmin);
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
      await appointmentsRepository.create(input.userId, input.date, req.ip),
    );
  },
});
