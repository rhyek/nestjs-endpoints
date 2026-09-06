import { Inject } from '@nestjs/common';
import { decorated, endpoint, z } from 'nestjs-endpoints';
import { UserRepository } from '../user.repository';
import { UserRepositoryToken } from '../user.repository.token';

export const userListNoPath = endpoint({
  output: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      email: z.string(),
    }),
  ),
  inject: {
    userRepository: decorated<UserRepository>(Inject(UserRepositoryToken)),
  },
  handler: ({ userRepository }) => userRepository.findAll(),
});
