import { ran } from '../../ran.middleware';
import lanes from '../router';

// A second child of the lanes router, in a folder with a name.
export default lanes.child({ middleware: [ran('extra')] });
