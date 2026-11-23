import { Access } from '../../../context/access';
import router from './router';

export default router.endpoint.query({ inject: { access: Access }, handler: () => null });
