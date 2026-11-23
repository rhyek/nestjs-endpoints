import router from './router';

// Listed by its router, not found by its name.
export default router.endpoint.query({ path: 'listed', handler: () => 'listed' });
