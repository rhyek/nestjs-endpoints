import { endpoint, z } from 'nestjs-endpoints';
import { UserService } from './user.service';

export default endpoint.query({
  input: z.object({
    id: z.coerce.number(),
  }),
  output: z
    .object({
      id: z.number(),
      name: z.string(),
      email: z.string(),
    })
    .nullable(),
  inject: {
    userService: UserService,
  },
  handler: ({ input, userService }) => userService.find(input.id),
});
