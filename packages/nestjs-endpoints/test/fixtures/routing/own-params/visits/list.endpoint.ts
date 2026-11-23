import { z } from 'zod';
import { endpoint } from '../../../../../src/endpoint-fn';

// Declares a path parameter that no folder or file of its URL names.
export default endpoint.query({
  params: z.object({ clinicId: z.string() }),
  handler: () => null,
});
