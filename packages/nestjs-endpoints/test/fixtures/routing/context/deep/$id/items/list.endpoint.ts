import router from './router.module';

export default router.endpoint.query({
  handler: ({ params, access }) => ({ id: params.id, granted: access.granted }),
});
