import { endpoint, z } from 'nestjs-endpoints';
import { AuthService } from '../../auth/auth.service';
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
    authService: AuthService,
  },
  handler: ({ input, userService, authService, schemas }) => {
    authService.checkPermission();
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
