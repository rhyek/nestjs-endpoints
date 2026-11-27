// The port of the app these specs call, from this repository's block of local ports (22500 to
// 22549), as this checkout has it: a worktree has them moved into its own (../../../ports.ts).
import { port } from '../../../ports';

export const API_PORT = port(22520);

// `pnpm dev` at the repository's root runs test-app-express on 22521 (its `dev` script), and this
// package's `dev` page calls it there (its own `dev` script). Both move with the checkout too.
