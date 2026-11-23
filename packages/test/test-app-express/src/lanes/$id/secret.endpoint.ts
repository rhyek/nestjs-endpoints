import router from './router';

export default router.endpoint.query({ handler: ({ params }) => 'secret ' + params.id });
