import { recording } from '../../order';
import resources from '../router';

export default resources.child({ ...recording('clients') });
