import { hooks } from '../log';
import router from './router';

export default router.endpoint.query({ ...hooks('outer endpoint'), handler: () => null });
