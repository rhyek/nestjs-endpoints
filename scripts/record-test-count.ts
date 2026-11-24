// Records how many tests a suite ran, from Vitest's JSON report, in docs/.vitepress/test-count.json,
// where the docs build reads the repository's number of tests for the home page. scripts/test.sh
// calls it after each suite whose tests are its own: the fastify and node suites run the express
// suite's specs again, and are left out.
//
//   node scripts/record-test-count.ts <suite> <vitest-json-report>

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [suite, report] = process.argv.slice(2);
if (!suite || !report) {
  throw new Error('usage: record-test-count.ts <suite> <vitest-json-report>');
}

const file = path.join(import.meta.dirname, '../docs/.vitepress/test-count.json');
const { numTotalTests } = JSON.parse(readFileSync(report, 'utf8')) as { numTotalTests: number };
const counts = JSON.parse(readFileSync(file, 'utf8')) as Record<string, number>;
counts[suite] = numTotalTests;
writeFileSync(file, `${JSON.stringify(counts, null, 2)}\n`);
