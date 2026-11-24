import router from './router';

// `list` under the parameter: no name beside `extra/:item`, which is on the side of `extra`.
export default router.endpoint.query({ handler: ({ params }) => 'list ' + params.id });
