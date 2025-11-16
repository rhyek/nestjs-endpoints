import { endpoint, z } from 'nestjs-endpoints';
import { UserService } from './user.service';

export default endpoint({
  input: z.object({
    // GET endpoints use query params for input,
    // so we need to coerce the string to a number
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
