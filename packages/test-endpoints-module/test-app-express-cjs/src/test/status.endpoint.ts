import { endpoint } from 'nestjs-endpoints';

export default endpoint({
  handler: () => {
    return {
      health: 'ok',
    };
  },
});
