// The ports the journey's two dev servers listen on, from this repository's block of local
// ports (22500 to 22549), as this checkout has it: a worktree has them moved into its own
// (../../../../ports.ts).
import { port } from '../../../../ports';

export const API_PORT = port(22510);
export const WEB_PORT = port(22511);
