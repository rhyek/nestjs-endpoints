// Before anything is measured: the two apps must be doing the same work. Their shared module must be
// the same file, and for each scenario they must answer with the same status and, where the
// scenario says so, the same content type and body bytes.
//
//   node benchmarks/scripts/parity.ts
import fs from 'node:fs';
import path from 'node:path';
import { undeclaredField } from '../nestjs-endpoints-app/src/shared.ts';
import { appNames, benchmarksDir, startServer, type AppName } from './lib.ts';
import { scenarios, type Scenario } from './scenarios.ts';

export type Answer = {
  status: number;
  contentType: string | null;
  body: string;
  headers: string[];
};

export async function ask(url: string, scenario: Scenario): Promise<Answer> {
  const response = await fetch(url + scenario.path, {
    method: scenario.method,
    headers: scenario.body === undefined ? {} : { 'content-type': 'application/json' },
    body: scenario.body === undefined ? undefined : JSON.stringify(scenario.body),
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    body: await response.text(),
    headers: [...response.headers.keys()].sort(),
  };
}

export type ParityReport = {
  scenario: string;
  status: number;
  bodyBytes: Record<AppName, number>;
  /** Response headers only one of the apps sends. */
  headerDifferences: string[];
}[];

export async function checkParity(): Promise<ParityReport> {
  const shared = appNames.map((app) =>
    fs.readFileSync(path.join(benchmarksDir, app, 'src/shared.ts'), 'utf8'),
  );
  if (shared.some((s) => s !== shared[0])) {
    throw new Error(`The apps' src/shared.ts differ; they must be the same file.`);
  }
  const answers = {} as Record<AppName, Answer[]>;
  for (const app of appNames) {
    const server = await startServer(app);
    try {
      answers[app] = [];
      for (const scenario of scenarios) {
        answers[app].push(await ask(server.url, scenario));
      }
    } finally {
      await server.stop();
    }
  }
  const [a, b] = appNames;
  const failures: string[] = [];
  const report: ParityReport = scenarios.map((scenario, i) => {
    const x = answers[a][i];
    const y = answers[b][i];
    if (x.status !== scenario.status || y.status !== scenario.status) {
      failures.push(
        `${scenario.id}: expected ${scenario.status}, got ${a} ${x.status}, ${b} ${y.status}`,
      );
    }
    if (scenario.parity === 'bytes') {
      if (x.contentType !== y.contentType) {
        failures.push(`${scenario.id}: content type ${a} ${x.contentType}, ${b} ${y.contentType}`);
      }
      for (const [app, answer] of [
        [a, x],
        [b, y],
      ] as const) {
        if (answer.body.includes(undeclaredField)) {
          failures.push(`${scenario.id}: ${app} sent the undeclared ${undeclaredField}`);
        }
      }
      if (x.body !== y.body) {
        failures.push(`${scenario.id}: bodies differ\n  ${a}: ${x.body}\n  ${b}: ${y.body}`);
      }
    }
    return {
      scenario: scenario.id,
      status: x.status,
      bodyBytes: { [a]: Buffer.byteLength(x.body), [b]: Buffer.byteLength(y.body) } as Record<
        AppName,
        number
      >,
      headerDifferences: [
        ...x.headers.filter((h) => !y.headers.includes(h)).map((h) => `${a} only: ${h}`),
        ...y.headers.filter((h) => !x.headers.includes(h)).map((h) => `${b} only: ${h}`),
      ],
    };
  });
  if (failures.length) {
    throw new Error(`The apps do not answer alike:\n${failures.join('\n')}`);
  }
  return report;
}

if (import.meta.main) {
  const report = await checkParity();
  for (const row of report) {
    const sizes = Object.entries(row.bodyBytes)
      .map(([app, n]) => `${app} ${n} B`)
      .join(', ');
    const headers = row.headerDifferences.length
      ? `; headers: ${row.headerDifferences.join(', ')}`
      : '';
    console.log(`ok  ${row.scenario.padEnd(14)} ${row.status}  ${sizes}${headers}`);
  }
}
