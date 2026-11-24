import { readFileSync } from 'node:fs';

/**
 * How many tests the repository has: the sum of what each suite ran the last time
 * scripts/test.sh ran it, which it records in test-count.json. Each test counts once, though the
 * end-to-end suite also runs on Fastify and the Node adapter.
 */
export function countTests(): number {
  const counts = JSON.parse(
    readFileSync(new URL('./test-count.json', import.meta.url), 'utf8'),
  ) as Record<string, number>;
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}
