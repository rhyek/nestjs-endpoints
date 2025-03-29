import { Inject, Injectable } from '@nestjs/common';
import { User } from './user.entity';

export type IUserRepository = {
  create: (data: { name: string; email: string }) => { id: number };
  find: (id: number) => User | null;
};

export const UserRepositoryToken = Symbol('UserRepository');

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
