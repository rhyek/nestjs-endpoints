import { EndpointRouter } from '../../../../src/endpoint-router';
import { Access } from '../context/access';

export default EndpointRouter.create({ providers: [Access], inject: { access: Access } });
