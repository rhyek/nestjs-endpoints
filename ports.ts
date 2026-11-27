// This repository's local ports. Its block in ~/Dev/reserved_port_ranges.txt is 22500-22549.
//
// A managed worktree (~/Dev/synced-utils/docs/git-workflow.md) has a block of its own, so that two
// checkouts can run the same suite at once. The `.env.worktree` at its root says how far that block
// sits from this repository's. The main checkout has no such file, and its ports are the block's
// own.
import fs from 'node:fs';

const shift = (() => {
  try {
    const env = fs.readFileSync(new URL('./.env.worktree', import.meta.url), 'utf8');
    return Number(/^WORKTREE_PORT_SHIFT=(-?\d+)$/m.exec(env)?.[1] ?? 0);
  } catch {
    return 0;
  }
})();

/** A port of this repository's block, as this checkout has it. */
export function port(mainCheckoutPort: number): number {
  return mainCheckoutPort + shift;
}
