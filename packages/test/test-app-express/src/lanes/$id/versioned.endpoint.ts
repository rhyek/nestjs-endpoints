import { Version } from '@nestjs/common';
import router from './router';

// A version of its own: in an app with versions in its URLs, it is under `/v2` only.
export default router.endpoint.query({
  decorators: [Version('2')],
  handler: ({ params }) => 'versioned ' + params.id,
});
