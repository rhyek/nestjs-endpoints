import { endpoint } from 'nestjs-endpoints';

// A GET, so a readiness probe (scripts/test.sh's start_server) can reach it.
export default endpoint.query({
  method: 'get',
  handler: () => {
    return {
      health: 'ok',
    };
  },
});
