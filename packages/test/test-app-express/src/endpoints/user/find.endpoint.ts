import { endpoint, z } from 'nestjs-endpoints';
import { UserService } from './user.service';

export default endpoint.query({
  input: z.object({
    id: z.coerce.number(),
  }),
  // @ts-expect-error: Type 'ZodNullable<ZodObject<{ id: ZodNumber; name: ZodString; email: ZodString; }, $strip>>' is not assignable to type 'undefin
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
