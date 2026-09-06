import { Module } from '@nestjs/common';
import { UserRepository } from '../user.repository';
import { UserRepositoryToken } from '../user.repository.token';
import { userListNoPath } from './user-list-no-path.endpoint';
import { userListWithPathNoSuffix } from './user-list-with-path-no-suffix';
import { userListWithPath } from './user-list-with-path.endpoint';

@Module({
  controllers: [
    userListNoPath,
    userListWithPath,
    userListWithPathNoSuffix,
  ],
  providers: [
    {
      provide: UserRepositoryToken,
      useClass: UserRepository,
    },
  ],
})
export class UserListModule {}
