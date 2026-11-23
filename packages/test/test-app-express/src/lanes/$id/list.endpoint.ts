import router from './router';

// The same route as `extra/list.endpoint.ts` has, but with a parameter where it has a name.
export default router.endpoint.query({ handler: ({ params }) => 'list ' + params.id });
