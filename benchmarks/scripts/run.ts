// Measures nestjs-endpoints against the same app written with plain NestJS controllers.
//
//   node benchmarks/scripts/run.ts            the full run (~35 minutes)
//   node benchmarks/scripts/run.ts --quick    a smoke run (~2 minutes), not for publishing
//
// See benchmarks/README.md for the method.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  appNames,
  benchmarksDir,
  build,
  environment,
  environmentLines,
  log,
  measure as measureServer,
  median,
  startServer,
  type AppName,
  type Environment,
  type ReadyInfo,
  type Sample as Measured,
} from './lib.ts';
import { checkParity, type ParityReport } from './parity.ts';
import { scenarios, type Scenario } from './scenarios.ts';

const { values: flags } = parseArgs({
  options: {
    quick: { type: 'boolean', default: false },
    rounds: { type: 'string' },
    duration: { type: 'string' },
    warmup: { type: 'string' },
    connections: { type: 'string', default: '64' },
    'latency-rounds': { type: 'string' },
    'skip-build': { type: 'boolean', default: false },
    scenario: { type: 'string', multiple: true },
  },
});

const config = {
  // A multiple of the three contenders, so each starts a round, and ends one, equally often.
  rounds: Number(flags.rounds ?? (flags.quick ? 1 : 6)),
  latencyRounds: Number(flags['latency-rounds'] ?? (flags.quick ? 1 : 3)),
  duration: flags.duration ?? (flags.quick ? '3s' : '10s'),
  warmup: flags.warmup ?? (flags.quick ? '1s' : '3s'),
  connections: Number(flags.connections),
  /** The fixed rate for the latency phase, as a share of the slower app's median throughput. */
  latencyLoad: 0.6,
};
const selected = flags.scenario?.length
  ? scenarios.filter((s) => flags.scenario!.includes(s.id))
  : scenarios;

// The control is a second, separate process of the vanilla app, measured like a third contender. The
// gap between it and the vanilla app is the run's noise floor: a difference between the two real
// contenders smaller than that is not a difference.
type Subject = { id: string; app: AppName };
const subjects: Subject[] = [
  { id: 'nestjs-endpoints', app: 'nestjs-endpoints-app' },
  { id: 'nestjs', app: 'nestjs-app' },
  { id: 'nestjs (control)', app: 'nestjs-app' },
];

/** Each round starts with a different contender, so none always runs first or last. */
function order(round: number): Subject[] {
  return subjects.map((_, i) => subjects[(i + round) % subjects.length]);
}

type Sample = Measured & { round: number };

const versions = {} as Record<AppName, ReadyInfo>;

async function measure(
  subject: Subject,
  scenario: Scenario,
  round: number,
  rate?: number,
): Promise<Sample> {
  const sample = await measureServer(
    async () => {
      const server = await startServer(subject.app);
      versions[subject.app] = server.ready;
      return server;
    },
    scenario,
    `${scenario.id} / ${subject.id} / round ${round}${rate ? ` @ ${rate} req/s` : ''}`,
    { duration: config.duration, warmup: config.warmup, connections: config.connections, rate },
  );
  return { round, ...sample };
}

function spread(values: number[]) {
  return { median: median(values), min: Math.min(...values), max: Math.max(...values) };
}

const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
const int = (x: number) => Math.round(x).toLocaleString('en-US');

type ScenarioResult = {
  scenario: Scenario;
  throughput: Record<string, Sample[]>;
  latencyRate: number;
  latency: Record<string, Sample[]>;
};

function markdown(env: Environment, results: ScenarioResult[], parity: ParityReport) {
  const [ours, theirs, control] = subjects.map((s) => s.id);
  const lines: string[] = [];
  lines.push(`# nestjs-endpoints vs NestJS`, '');
  lines.push(
    ...environmentLines(env, {
      ...versions['nestjs-app']?.versions,
      ...versions['nestjs-endpoints-app']?.versions,
    }),
    `${config.rounds} rounds × ${config.duration} (after ${config.warmup} warmup) at ${config.connections} ` +
      `keep-alive connections, a fresh server process per measurement, contenders interleaved.`,
    '',
  );
  lines.push('## Throughput', '');
  lines.push(
    `| Scenario | ${ours} req/s | ${theirs} req/s | Difference | Noise floor (A/A) |`,
    '| --- | --- | --- | --- | --- |',
  );
  for (const r of results) {
    const a = spread(r.throughput[ours].map((s) => s.requestsPerSec));
    const b = spread(r.throughput[theirs].map((s) => s.requestsPerSec));
    const c = spread(r.throughput[control].map((s) => s.requestsPerSec));
    lines.push(
      `| ${r.scenario.title} | ${int(a.median)} (${int(a.min)}–${int(a.max)}) | ` +
        `${int(b.median)} (${int(b.min)}–${int(b.max)}) | ${pct(a.median / b.median - 1)} | ` +
        `${pct(c.median / b.median - 1)} |`,
    );
  }
  lines.push(
    '',
    `Medians, with the range across rounds. Difference is ${ours} against ${theirs}; the noise floor is a ` +
      `second ${theirs} process against the first, so a difference within it is not one.`,
    '',
  );
  lines.push('## Latency at a fixed rate', '');
  lines.push(
    `| Scenario | Rate (req/s) | ${ours} p50 / p99 / p99.9 (ms) | ${theirs} p50 / p99 / p99.9 (ms) | ` +
      `${control} p50 / p99 / p99.9 (ms) |`,
    '| --- | --- | --- | --- | --- |',
  );
  for (const r of results) {
    const cell = (id: string) =>
      ['p50', 'p99', 'p99.9']
        .map((p) => median(r.latency[id].map((s) => s.latencyMs[p])).toFixed(2))
        .join(' / ');
    lines.push(
      `| ${r.scenario.title} | ${int(r.latencyRate)} | ${cell(ours)} | ${cell(theirs)} | ` +
        `${cell(control)} |`,
    );
  }
  lines.push(
    '',
    `All at the same open-loop rate, ${config.latencyLoad * 100}% of the slower one's median throughput, ` +
      `corrected for coordinated omission; medians of ${config.latencyRounds} rounds. The tail is ` +
      `where a busy machine shows first: a p99 gap between ${ours} and ${theirs} means something only ` +
      `if ${theirs} and its control agree.`,
    '',
  );
  lines.push('## Headroom', '');
  lines.push('| Scenario | Server CPU (cores) | oha CPU (cores) |', '| --- | --- | --- |');
  for (const r of results) {
    const all = Object.values(r.throughput).flat();
    lines.push(
      `| ${r.scenario.title} | ${median(all.map((s) => s.serverCores)).toFixed(2)} | ` +
        `${median(all.map((s) => s.ohaCores)).toFixed(2)} |`,
    );
  }
  lines.push(
    '',
    'A server near 1.0 core is saturated (Node runs the app on one thread); oha well below the core ' +
      'count means the load generator was not the bottleneck.',
    '',
  );
  lines.push('## Response sizes', '');
  lines.push(
    `| Scenario | Status | ${appNames.join(' | ')} |`,
    `| --- | --- | ${appNames.map(() => '---').join(' | ')} |`,
  );
  for (const row of parity) {
    lines.push(
      `| ${row.scenario} | ${row.status} | ${appNames.map((a) => `${row.bodyBytes[a]} B`).join(' | ')} |`,
    );
  }
  lines.push(
    '',
    "Every 200 body is byte-identical across the two apps. A 400 body is each framework's own: " +
      'nestjs-endpoints returns the Zod issues, Nest a list of messages.',
    '',
  );
  return lines.join('\n');
}

async function main() {
  const env = environment();
  if (!flags['skip-build']) {
    build();
  }
  log('checking that both apps answer alike');
  const parity = await checkParity();

  const results: ScenarioResult[] = [];
  for (const scenario of selected) {
    const result: ScenarioResult = { scenario, throughput: {}, latencyRate: 0, latency: {} };
    for (const s of subjects) {
      result.throughput[s.id] = [];
      result.latency[s.id] = [];
    }
    results.push(result);
  }

  // Every sample is saved as soon as it is taken, so a run that fails late keeps what it measured.
  const outDir = path.join(benchmarksDir, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = env.date.replace(/[:.]/g, '-');
  const jsonFile = path.join(outDir, `${stamp}.json`);
  const save = (complete: boolean) =>
    fs.writeFileSync(
      jsonFile,
      JSON.stringify({ complete, env, config, versions, parity, results }, null, 2) + '\n',
    );

  log('throughput: as many requests as each app can answer');
  for (let round = 1; round <= config.rounds; round++) {
    for (const result of results) {
      for (const subject of order(round)) {
        result.throughput[subject.id].push(await measure(subject, result.scenario, round));
        save(false);
      }
    }
  }

  log('latency: both apps at the same fixed rate');
  for (const result of results) {
    const slower = Math.min(
      ...subjects
        .slice(0, 2)
        .map((s) => median(result.throughput[s.id].map((x) => x.requestsPerSec))),
    );
    result.latencyRate = Math.round((slower * config.latencyLoad) / 100) * 100;
  }
  for (let round = 1; round <= config.latencyRounds; round++) {
    for (const result of results) {
      for (const subject of order(round)) {
        result.latency[subject.id].push(
          await measure(subject, result.scenario, round, result.latencyRate),
        );
        save(false);
      }
    }
  }

  save(true);
  const report = markdown(env, results, parity);
  fs.writeFileSync(path.join(outDir, `${stamp}.md`), report);
  console.log('\n' + report);
  log(`results: ${path.join('benchmarks/results', `${stamp}.md`)} (and .json)`);
}

await main();
