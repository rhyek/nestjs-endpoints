import { endpoint } from 'nestjs-endpoints';
import { z } from 'zod';
import { HelloService } from './hello.service';

export default endpoint({
  input: z.object({
    name: z.string(),
  }),
  output: z.string(),
  inject: {
    helloService: HelloService,
  },
  handler: ({ input, helloService }) => helloService.greet(input.name),
});
