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
  handler: ({ input, userService, schemas }) => {
    schemas.input
      .superRefine((_, ctx) => {
        if (input.name === 'error') {
          ctx.addIssue({
            code: 'custom',
            message: 'The name triggered me',
            path: ['name'],
          });
        }
      })
      .parse(input);
    const user = userService.create(input);
    return {
      id: user.id,
      extra: 'This will be stripped',
    };
  },
});
