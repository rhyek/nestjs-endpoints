// From this repository's block of local ports; a worktree has them moved into its own (../ports.ts).
import { port } from '../ports.ts';

export const ports = {
  'nestjs-endpoints-app': port(22500),
  'nestjs-app': port(22501),
} as const;
