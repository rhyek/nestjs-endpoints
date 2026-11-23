import router from './router';

// Served at the router's own base path, `/company`.
export default router.endpoint.query({
  handler() {
    return 'at the base path';
  },
});
