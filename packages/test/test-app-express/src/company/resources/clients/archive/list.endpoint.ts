import router from './router';

// Its hook runs after its router's, which has no router under it.
export default router.endpoint.query({
  lifecycle: {
    onModuleInit() {
      this.log.entries.push('archive endpoint init');
    },
  },
  handler() {
    this.log.entries.push('archive handler');
    return ['old'];
  },
});
