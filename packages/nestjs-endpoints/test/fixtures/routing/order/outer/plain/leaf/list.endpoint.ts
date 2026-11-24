import { hooks } from '../../../log';
import router from './router';

export default router.endpoint.query({ ...hooks('leaf endpoint'), handler: () => null });
