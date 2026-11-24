import { recording } from '../order';
import company from '../router';

export default company.child({ ...recording('resources') });
