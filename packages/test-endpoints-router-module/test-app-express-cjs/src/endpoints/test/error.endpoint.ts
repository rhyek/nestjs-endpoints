import { endpoint } from 'nestjs-endpoints';

export default endpoint({
  handler: async () => {
    throw new Error('test');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  },
});
