import { EndpointRouter } from '../../../../../src/endpoint-router';
import { Access } from '../access';

export default EndpointRouter.create({
  providers: [Access],
  context: {
    inject: { access: Access },
  },
});
