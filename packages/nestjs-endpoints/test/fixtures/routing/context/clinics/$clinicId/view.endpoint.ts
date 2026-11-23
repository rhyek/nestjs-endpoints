import router from './router.module';

export default router.endpoint.query({
  handler: ({ params, access }) => ({ clinicId: params.clinicId, granted: access.granted }),
});
