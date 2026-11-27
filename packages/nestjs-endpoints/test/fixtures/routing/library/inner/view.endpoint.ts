import router from './router';

export default router.endpoint.query({
  handler: (given: object) => Object.keys(given).sort(),
});
