import { badge } from '../checks';
import checkpoints from '../router';

// Provides a badge of its own: the guards and interceptors above it keep theirs.
export default checkpoints.child({ providers: [badge('gate')] });
