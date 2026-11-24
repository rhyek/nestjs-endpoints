import router from './router';

// Its hook runs after its router's.
export default router.endpoint.query({
  lifecycle: {
    onModuleInit() {
      this.log.entries.push('clients endpoint init');
    },
  },
  handler() {
    this.log.entries.push('clients handler');
    return ['acme'];
  },
});
