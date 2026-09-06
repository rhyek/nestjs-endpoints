import { Inject } from '@nestjs/common';
import { decorated, endpoint } from 'nestjs-endpoints';
import { UserRepository } from './user.repository';
import { UserRepositoryToken } from './user.repository.token';

export default endpoint({
  method: 'post',
  inject: {
    userRepository: decorated<UserRepository>(Inject(UserRepositoryToken)),
  },
  handler: ({ userRepository }) => {
    userRepository.purge();
  },
});
