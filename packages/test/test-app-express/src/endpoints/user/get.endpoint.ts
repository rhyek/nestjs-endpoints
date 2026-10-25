import { NotFoundException } from '@nestjs/common';
import { endpoint, z } from 'nestjs-endpoints';
import { UserService } from './user.service';

export default endpoint.query({
  input: z.object({
    id: z.coerce.number(),
  }),
  output: z.object({
    id: z.number(),
    name: z.string(),
    email: z.string(),
  }),
  inject: {
    userService: UserService,
  },
  handler: ({ input, userService }) => {
    const user = userService.find(input.id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  },
});
