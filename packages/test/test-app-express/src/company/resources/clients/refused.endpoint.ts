import router from './router';

// A guard passed as an instance, that refuses every request.
export default router.endpoint.query({
  guards: [{ canActivate: () => false }],
  handler() {
    this.log.entries.push('refused handler');
    return null;
  },
});
