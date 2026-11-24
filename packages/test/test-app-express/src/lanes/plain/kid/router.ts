import { ran } from '../../../ran.middleware';
import plain from '../router';

export default plain.child({ middleware: [ran('kid')] });
