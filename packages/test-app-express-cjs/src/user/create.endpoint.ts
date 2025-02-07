import { endpoint, z } from 'nestjs-endpoints';
import { UserService } from './user.service';

export default endpoint({
  method: 'post',
  input: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  output: z.object({
    id: z.number(),
  }),
  inject: {
    userService: UserService,
  },
  handler: ({ input, userService }) => ({
    id: userService.create(input).id,
    extra: 'This will be stripped',
  }),
});
