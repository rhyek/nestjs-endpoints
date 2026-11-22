import { endpoint } from 'nestjs-endpoints';
import { listUsers, userList } from '../../shared';

// GET /users/list
export default endpoint.query({
  method: 'get',
  output: userList,
  handler: () => listUsers(),
});
