import { ran } from '../../ran.middleware';
import names from '../router';

export default names.child({ middleware: [ran('extra')] });
