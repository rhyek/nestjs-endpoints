import { endpoint } from 'nestjs-endpoints';

// Under an app's root router, whose base path is the root.
export default endpoint.query({ handler: () => 'rooted list' });
