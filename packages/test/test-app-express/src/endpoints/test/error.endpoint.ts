import { endpoint } from 'nestjs-endpoints';

export default endpoint.query({
  handler: () => Promise.reject(new Error('test')),
});
