// What each part of NestJS's schema validation costs. The vanilla app is measured as it is and
// with one part taken out at a time (nestjs-app/src/breakdown), beside nestjs-endpoints.
//
//   node benchmarks/scripts/breakdown.ts            the full run (~30 minutes)
//   node benchmarks/scripts/breakdown.ts --quick    a smoke run (~3 minutes), not for publishing
//
// See benchmarks/README.md for the method.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { partIds, parts, type PartId } from '../nestjs-app/src/breakdown/parts.ts';
import {
  benchmarksDir,
  build,
  environment,
  environmentLines,
  log,
  measure,
  median,
  startServer,
  type AppName,
  type Environment,
  type Sample,
} from './lib.ts';
import { ask } from './parity.ts';
import { scenarios, type Scenario } from './scenarios.ts';

const { values: flags } = parseArgs({
  options: {
    quick: { type: 'boolean', default: false },
    rounds: { type: 'string' },
    duration: { type: 'string' },
    warmup: { type: 'string' },
    connections: { type: 'string', default: '64' },
    'skip-build': { type: 'boolean', default: false },
    scenario: { type: 'string', multiple: true },
  },
});

const config = {
  rounds: Number(flags.rounds ?? (flags.quick ? 1 : 6)),
  duration: flags.duration ?? (flags.quick ? '3s' : '10s'),
  warmup: flags.warmup ?? (flags.quick ? '1s' : '3s'),
  connections: Number(flags.connections),
  /** Requests each app answers, one at a time, while what it creates is counted. */
  countedRequests: 500,
};

// The requests validated on the way in and on the way out. The apps whose handlers parse for
// themselves answer an invalid request with a 500, so the rejected request is not one of them.
const validated = ['params-query', 'valid-body'];
const selected = scenarios.filter(
  (s) => validated.includes(s.id) && (!flags.scenario?.length || flags.scenario.includes(s.id)),
);
if (!selected.length) {
  throw new Error(`--scenario must be one of ${validated.join(', ')}`);
}
// What a request creates is also counted for the request with no schemas: it is what the
// validated ones are compared with.
const counted = [scenarios.find((s) => s.id === 'baseline')!, ...selected];

type Contender = { id: string; app: AppName; part?: PartId };
const nest: Contender = { id: 'nestjs', app: 'nestjs-app' };
// A second process of the same app: its gap to the first is the run's noise.
const control: Contender = { id: 'nestjs (control)', app: 'nestjs-app' };
const without = Object.fromEntries(
  partIds.map((part) => [part, { id: `nestjs: ${part}`, app: 'nestjs-app', part }]),
) as Record<PartId, Contender>;
const endpoints: Contender = { id: 'nestjs-endpoints', app: 'nestjs-endpoints-app' };
/** Every app that differs from another: the control is left out where a process is not timed. */
const distinct = [nest, ...Object.values(without), endpoints];
const contenders = [nest, control, ...Object.values(without), endpoints];

const versions: Record<string, string> = {};

async function start(contender: Contender, nodeArgs: string[] = []) {
  const server = await startServer(
    contender.app,
    contender.part
      ? { entry: 'dist/breakdown/main.js', env: { PART: contender.part }, nodeArgs }
      : { nodeArgs },
  );
  if (server.ready.part !== contender.part) {
    await server.stop();
    throw new Error(`${contender.id} started as "${server.ready.part}"`);
  }
  Object.assign(versions, server.ready.versions);
  return server;
}

/** Every app must answer each request as the vanilla app does, byte for byte. */
async function checkAnswers() {
  const answers = new Map<Contender, Awaited<ReturnType<typeof ask>>[]>();
  for (const contender of distinct) {
    const server = await start(contender);
    try {
      const given = [];
      for (const scenario of selected) {
        given.push(await ask(server.url, scenario));
      }
      answers.set(contender, given);
    } finally {
      await server.stop();
    }
  }
  const failures: string[] = [];
  selected.forEach((scenario, i) => {
    const expected = answers.get(nest)![i];
    for (const contender of distinct) {
      const got = answers.get(contender)![i];
      if (
        got.status !== scenario.status ||
        got.contentType !== expected.contentType ||
        got.body !== expected.body
      ) {
        failures.push(`${scenario.id}: ${contender.id} answered ${got.status} ${got.body}`);
      }
    }
  });
  if (failures.length) {
    throw new Error(`The apps do not answer alike:\n${failures.join('\n')}`);
  }
}

type Created = { promises: number; subscriptions: number };

/** What one request makes the app create, for each scenario: see count-hook.ts. */
async function countCreated(contender: Contender): Promise<Record<string, Created>> {
  const server = await start(contender, [
    '--import',
    path.join(import.meta.dirname, 'count-hook.ts'),
  ]);
  const lines = readline.createInterface({ input: server.stderr });
  let report: ((counts: Record<string, number>) => void) | undefined;
  lines.on('line', (line) => {
    if (line.startsWith('COUNTS ')) {
      report?.(JSON.parse(line.slice('COUNTS '.length)) as Record<string, number>);
    }
  });
  const sinceLast = () =>
    new Promise<Record<string, number>>((resolve) => {
      report = resolve;
      process.kill(server.pid, 'SIGUSR2');
    });
  try {
    const created: Record<string, Created> = {};
    for (const scenario of counted) {
      for (let i = 0; i < 50; i++) {
        await ask(server.url, scenario);
      }
      await sinceLast();
      for (let i = 0; i < config.countedRequests; i++) {
        await ask(server.url, scenario);
      }
      const counts = await sinceLast();
      const perRequest = (n = 0) => Math.round((n / config.countedRequests) * 100) / 100;
      created[scenario.id] = {
        promises: perRequest(counts.PROMISE),
        subscriptions: perRequest(counts.subscription),
      };
    }
    return created;
  } finally {
    lines.close();
    await server.stop();
  }
}

type Results = {
  created: Record<string, Record<string, Created>>;
  /** Scenario id, then contender id. */
  throughput: Record<string, Record<string, (Sample & { round: number })[]>>;
};

const int = (x: number) => Math.round(x).toLocaleString('en-US');

/** Microseconds of one saturated core each request takes: the inverse of the median throughput. */
function microseconds(results: Results, scenario: Scenario, contender: Contender) {
  return 1e6 / median(results.throughput[scenario.id][contender.id].map((s) => s.requestsPerSec));
}

function markdown(env: Environment, results: Results) {
  const lines: string[] = [];
  lines.push(`# What NestJS's schema validation costs, part by part`, '');
  lines.push(
    ...environmentLines(env, versions),
    `${config.rounds} rounds × ${config.duration} (after ${config.warmup} warmup) at ${config.connections} ` +
      `keep-alive connections, a fresh server process per measurement, contenders interleaved.`,
    '',
  );
  const row = (of: Scenario[], cell: (scenario: Scenario) => string[]) =>
    of.flatMap((scenario) => cell(scenario)).join(' | ');
  const titles = (of: Scenario[], ...columns: string[]) => [
    `| | ${row(of, (s) => columns.map((c) => `${s.id}: ${c}`))} |`,
    `| --- | ${row(of, () => columns.map(() => '---'))} |`,
  ];
  const perScenario = (cell: (scenario: Scenario) => string[]) => row(selected, cell);

  lines.push('## The contenders', '');
  lines.push('| Contender | The vanilla app, with |', '| --- | --- |');
  for (const contender of Object.values(without)) {
    lines.push(`| ${contender.id} | ${parts[contender.part!]} |`);
  }
  lines.push('');

  lines.push('## What one request creates', '');
  lines.push(...titles(counted, 'promises', 'RxJS subscriptions'));
  for (const contender of distinct) {
    lines.push(
      `| ${contender.id} | ${row(counted, (s) => {
        const { promises, subscriptions } = results.created[s.id][contender.id];
        return [String(promises), String(subscriptions)];
      })} |`,
    );
  }
  lines.push(
    '',
    `Counted over ${config.countedRequests} requests sent one at a time, in a process of its own.`,
    '',
  );

  lines.push('## Time per request', '');
  lines.push(...titles(selected, 'req/s', 'µs'));
  for (const contender of contenders) {
    lines.push(
      `| ${contender.id} | ${perScenario((s) => {
        const samples = results.throughput[s.id][contender.id].map((x) => x.requestsPerSec);
        return [
          `${int(median(samples))} (${int(Math.min(...samples))}–${int(Math.max(...samples))})`,
          microseconds(results, s, contender).toFixed(2),
        ];
      })} |`,
    );
  }
  lines.push(
    '',
    'Medians, with the range across rounds. µs is what a request takes of one saturated core: ' +
      '1,000,000 / the median req/s.',
    '',
  );

  // What a part costs is what the app gains without it. The parts of a part: what NestJS spends
  // to run a pipe or an interceptor that does nothing, and the rest, which is that one's own work.
  const us = (s: Scenario, c: Contender) => microseconds(results, s, c);
  const rows: [string, (s: Scenario) => number][] = [
    ['The interceptor', (s) => us(s, nest) - us(s, without['no-interceptor'])],
    [
      '– running any interceptor',
      (s) => us(s, without['pass-through-interceptor']) - us(s, without['no-interceptor']),
    ],
    [
      "– the serializer's own work",
      (s) => us(s, nest) - us(s, without['pass-through-interceptor']),
    ],
    ['The pipes', (s) => us(s, nest) - us(s, without['no-pipe'])],
    ['– running any pipe', (s) => us(s, without['pass-through-pipe']) - us(s, without['no-pipe'])],
    ["– the schema pipe's own work", (s) => us(s, nest) - us(s, without['pass-through-pipe'])],
    ['– – of which removing prototype keys', (s) => us(s, nest) - us(s, without['no-key-removal'])],
    [
      'The pipes, apart from removing prototype keys',
      (s) => us(s, without['no-key-removal']) - us(s, without['no-pipe']),
    ],
  ];
  const both = (s: Scenario) => rows[0][1](s) + rows[3][1](s);
  lines.push('## The parts', '');
  lines.push(...titles(selected, 'µs', 'share'));
  for (const [title, cost] of rows) {
    lines.push(
      `| ${title} | ${perScenario((s) => [cost(s).toFixed(2), `${Math.round((cost(s) / both(s)) * 100)}%`])} |`,
    );
  }
  const totals: [string, (s: Scenario) => number][] = [
    ['The interceptor and the pipes, added up', both],
    ['Both taken out (nestjs: neither)', (s) => us(s, nest) - us(s, without.neither)],
    ['nestjs-endpoints', (s) => us(s, nest) - us(s, endpoints)],
    ['Noise: the control against nestjs', (s) => Math.abs(us(s, control) - us(s, nest))],
  ];
  for (const [title, cost] of totals) {
    lines.push(`| ${title} | ${perScenario((s) => [cost(s).toFixed(2), ''])} |`);
  }
  lines.push(
    '',
    'µs is how much less a request takes than in nestjs as it is. A share is of the interceptor ' +
      'and the pipes added up. A part smaller than the noise is not measured.',
    '',
  );
  return lines.join('\n');
}

async function main() {
  const env = environment();
  if (!flags['skip-build']) {
    build();
  }
  log('checking that every app answers alike');
  await checkAnswers();

  const results: Results = { created: {}, throughput: {} };
  for (const scenario of counted) {
    results.created[scenario.id] = {};
  }
  for (const scenario of selected) {
    results.throughput[scenario.id] = Object.fromEntries(contenders.map((c) => [c.id, []]));
  }

  log('counting what one request creates');
  for (const contender of distinct) {
    const created = await countCreated(contender);
    for (const scenario of counted) {
      results.created[scenario.id][contender.id] = created[scenario.id];
      const { promises, subscriptions } = created[scenario.id];
      log(`${scenario.id} / ${contender.id}: ${promises} promises, ${subscriptions} subscriptions`);
    }
  }
  for (const scenario of selected) {
    if (!results.created[scenario.id][nest.id].subscriptions) {
      throw new Error(
        `${scenario.id}: no RxJS subscription was counted in ${nest.id}, whose interceptor ` +
          'subscribes on every request: count-hook.ts is not counting the rxjs NestJS loads.',
      );
    }
  }

  // Every sample is saved as soon as it is taken, so a run that fails late keeps what it measured.
  const outDir = path.join(benchmarksDir, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = `${env.date.replace(/[:.]/g, '-')}-breakdown`;
  const jsonFile = path.join(outDir, `${stamp}.json`);
  const save = (complete: boolean) =>
    fs.writeFileSync(
      jsonFile,
      JSON.stringify({ complete, env, config, versions, results }, null, 2) + '\n',
    );

  log('throughput: as many requests as each app can answer');
  for (let round = 1; round <= config.rounds; round++) {
    for (const scenario of selected) {
      // Each round starts with a different contender, so none always runs first or last.
      for (let i = 0; i < contenders.length; i++) {
        const contender = contenders[(i + round) % contenders.length];
        const sample = await measure(
          () => start(contender),
          scenario,
          `${scenario.id} / ${contender.id} / round ${round}`,
          { duration: config.duration, warmup: config.warmup, connections: config.connections },
        );
        results.throughput[scenario.id][contender.id].push({ round, ...sample });
        save(false);
      }
    }
  }

  save(true);
  const report = markdown(env, results);
  fs.writeFileSync(path.join(outDir, `${stamp}.md`), report);
  console.log('\n' + report);
  log(`results: ${path.join('benchmarks/results', `${stamp}.md`)} (and .json)`);
}

await main();
