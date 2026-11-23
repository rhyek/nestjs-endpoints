import { z } from 'nestjs-endpoints';
import { ran } from '../../ran.middleware';
import lanes from '../router';

// In a folder that names a path parameter, beside folders and files that name none. It
// leaves one of its own routes out.
export default lanes.child({
  params: z.object({ id: z.string() }),
  middleware: [ran('id'), { exclude: ['secret'] }],
});
