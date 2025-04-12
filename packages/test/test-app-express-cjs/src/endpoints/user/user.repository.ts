import { Injectable } from '@nestjs/common';
import type { User } from './user.entity';

@Injectable()
export class UserRepository {
  private users: User[] = [];

  create(data: { name: string; email: string }) {
    const user = {
      id: this.users.length + 1,
      name: data.name,
      email: data.email,
    };
    this.users.push(user);
    return user;
  }

  find(id: number) {
    return this.users.find((user) => user.id === id) ?? null;
  }

  findAll() {
    return this.users;
  }

  purge() {
    this.users = [];
  }
}
