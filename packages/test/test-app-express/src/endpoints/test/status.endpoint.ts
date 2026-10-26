import { endpoint } from 'nestjs-endpoints';

// A GET, so a readiness probe (scripts/test.sh's wait-for) can reach it.
export default endpoint.query({
  method: 'get',
  handler: () => {
    return {
      health: 'ok',
    };
  },
});
