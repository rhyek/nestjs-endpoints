import { endpoint } from 'nestjs-endpoints';
import { healthBody } from '../shared';

// GET /health: no schemas, the framework's own cost.
export default endpoint.query({
  method: 'get',
  handler: () => healthBody,
});
