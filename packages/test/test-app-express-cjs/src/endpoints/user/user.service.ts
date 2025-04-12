import { Inject, Injectable } from '@nestjs/common';
import { User } from './user.entity';
import { UserRepositoryToken } from './user.repository.token';

export type IUserRepository = {
  create: (data: { name: string; email: string }) => { id: number };
  find: (id: number) => User | null;
};

@Injectable()
export class UserService {
  constructor(
    @Inject(UserRepositoryToken)
    private readonly userRepository: IUserRepository,
  ) {}

  create(data: { name: string; email: string }) {
    return this.userRepository.create(data);
  }

  find(id: number) {
    return this.userRepository.find(id);
  }
}
