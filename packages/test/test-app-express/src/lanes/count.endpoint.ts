import router from './router';

// A GET, which serves HEAD too.
export default router.endpoint.query({ method: 'get', handler: () => 3 });
