import router from './router.module';

export default router.endpoint.query({
  handler: ({ params, visits }) => ({ id: params.id, granted: visits.access.granted }),
});
