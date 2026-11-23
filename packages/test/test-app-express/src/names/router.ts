import { EndpointRouter } from 'nestjs-endpoints';
import { ran } from '../ran.middleware';

// A tree for the names beside a path parameter: every URL under a name is the name's, and
// a parameter does not take the name as a value. Its middleware, and that of the routers
// under it, add their names to the `x-ran` header.
export default EndpointRouter.create({ middleware: [ran('names')] });
