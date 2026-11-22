import { endpoint } from 'nestjs-endpoints';
import { createUser, createUserInput, user } from '../../shared';

// POST /users/create
export default endpoint.mutation({
  input: createUserInput,
  output: user,
  handler: ({ input }) => createUser(input),
});
