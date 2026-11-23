import router from './router';

export default router.endpoint.query({ handler: ({ params }) => 'view ' + params.id });
