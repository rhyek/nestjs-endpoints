import router from './router';

// Served at its router's own base path, `/lanes/:id`.
export default router.endpoint.query({ handler: ({ params }) => `at ${params.id}` });
