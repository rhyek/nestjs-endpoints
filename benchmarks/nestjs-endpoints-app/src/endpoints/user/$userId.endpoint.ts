import { endpoint } from 'nestjs-endpoints';
import { findUser, user, userParams, userQuery } from '../../shared';

// GET /user/:userId?include=profile
export default endpoint.query({
  method: 'get',
  params: userParams,
  query: userQuery,
  output: user,
  handler: ({ params, query }) => findUser(params.userId, query.include),
});
