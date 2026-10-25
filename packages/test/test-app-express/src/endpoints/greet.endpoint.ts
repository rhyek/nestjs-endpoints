import { endpoint } from 'nestjs-endpoints';
import { z } from 'zod';
import { HelloService } from './hello.service';

export const greetInput = z.object({
  name: z.string(),
});

export default endpoint.query({
  input: greetInput,
  output: z.string(),
  inject: {
    helloService: HelloService,
  },
  handler: ({ input, helloService }) => helloService.greet(input.name),
});
