import router from './router.module';

export default router.endpoint.query({ handler: ({ access }) => access.granted });
