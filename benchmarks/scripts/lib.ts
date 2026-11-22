import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ports } from '../ports.ts';
import type { Scenario } from './scenarios.ts';

export const benchmarksDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoDir = path.resolve(benchmarksDir, '..');

export type AppName = keyof typeof ports;
export const appNames = Object.keys(ports) as AppName[];

export type ReadyInfo = { node: string; versions: Record<string, string> };

export type Server = {
  app: AppName;
  pid: number;
  url: string;
  ready: ReadyInfo;
  /** Cumulative CPU seconds the server process has used. */
  cpuSeconds(): number;
  stop(): Promise<void>;
};

// Every process this run started, so that an interrupted run leaves none behind. Each is stopped by
// its own PID, never by a name or a port.
const live = new Set<ChildProcess>();
function stopAll() {
  for (const child of live) {
    child.kill('SIGKILL');
  }
}
process.on('exit', stopAll);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopAll();
    process.exit(130);
  });
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

/** `ps -o time=` prints `[[dd-]hh:]mm:ss.cc`. */
function parsePsTime(value: string): number {
  const [days, rest] = value.includes('-') ? value.split('-') : ['0', value];
  const parts = rest.split(':').map(Number);
  let seconds = 0;
  for (const part of parts) {
    seconds = seconds * 60 + part;
  }
  return Number(days) * 86400 + seconds;
}

export function processCpuSeconds(pid: number): number {
  return parsePsTime(
    execFileSync('ps', ['-o', 'time=', '-p', String(pid)], { encoding: 'utf8' }).trim(),
  );
}

/** Starts a fresh process of `app` in production mode and waits for its ready line. */
export async function startServer(app: AppName): Promise<Server> {
  const port = ports[app];
  if (await portInUse(port)) {
    throw new Error(
      `Port ${port} (${app}) is already in use by a process this run did not start. ` +
        `Find it with \`lsof -nP -iTCP:${port} -sTCP:LISTEN\` and stop it yourself.`,
    );
  }
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: path.join(benchmarksDir, app),
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  live.add(child);
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  void exited.then(() => live.delete(child));
  let stderr = '';
  child.stderr!.on('data', (chunk) => (stderr += chunk));
  const ready = await new Promise<ReadyInfo>((resolve, reject) => {
    let stdout = '';
    const timer = setTimeout(
      () => reject(new Error(`${app} did not start within 15s\n${stderr}`)),
      15_000,
    );
    child.stdout!.on('data', (chunk) => {
      stdout += chunk;
      const line = stdout.split('\n').find((l) => l.startsWith('{"ready":true'));
      if (line) {
        clearTimeout(timer);
        resolve(JSON.parse(line) as ReadyInfo);
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`${app} exited with code ${code} before it was ready\n${stderr}`));
    });
  });
  return {
    app,
    pid: child.pid!,
    url: `http://127.0.0.1:${port}`,
    ready,
    cpuSeconds: () => processCpuSeconds(child.pid!),
    async stop() {
      child.kill('SIGTERM');
      const killTimer = setTimeout(() => child.kill('SIGKILL'), 5_000);
      await exited;
      clearTimeout(killTimer);
    },
  };
}

export type OhaResult = {
  summary: { successRate: number; total: number; requestsPerSec: number; sizePerRequest: number };
  latencyPercentiles: Record<string, number>;
  statusCodeDistribution: Record<string, number>;
  errorDistribution: Record<string, number>;
  /** CPU seconds oha itself used (user + sys), to show the load generator had headroom. */
  ohaCpuSeconds: number;
};

export type LoadOptions = {
  duration: string;
  connections: number;
  /** A fixed request rate (open loop), corrected for coordinated omission. Unset: as fast as it goes. */
  rate?: number;
};

export function ohaArgs(server: Server, scenario: Scenario, options: LoadOptions): string[] {
  const args = [
    '-z',
    options.duration,
    '-c',
    String(options.connections),
    '-w',
    '--no-tui',
    '--output-format',
    'json',
    '-m',
    scenario.method,
  ];
  if (options.rate) {
    args.push('-q', String(options.rate), '--latency-correction');
  }
  if (scenario.body !== undefined) {
    args.push('-H', 'content-type: application/json', '-d', JSON.stringify(scenario.body));
  }
  args.push(server.url + scenario.path);
  return args;
}

/** Runs oha under `/usr/bin/time -l`, which reports oha's own CPU use on stderr. */
export function runOha(args: string[]): Promise<OhaResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/time', ['-l', 'oha', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    live.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('exit', (code) => {
      live.delete(child);
      if (code !== 0) {
        reject(new Error(`oha exited with code ${code}\n${stderr}`));
        return;
      }
      const times = /([\d.]+) real\s+([\d.]+) user\s+([\d.]+) sys/.exec(stderr);
      const result = JSON.parse(stdout) as Omit<OhaResult, 'ohaCpuSeconds'>;
      resolve({ ...result, ohaCpuSeconds: times ? Number(times[2]) + Number(times[3]) : NaN });
    });
  });
}

/** Throws unless every request got the scenario's status and none errored. */
export function assertClean(result: OhaResult, scenario: Scenario, label: string) {
  const statuses = Object.keys(result.statusCodeDistribution);
  const errors = Object.entries(result.errorDistribution);
  if (statuses.length !== 1 || statuses[0] !== String(scenario.status) || errors.length > 0) {
    throw new Error(
      `${label}: expected every request to answer ${scenario.status}, got statuses ` +
        `${JSON.stringify(result.statusCodeDistribution)} and errors ${JSON.stringify(result.errorDistribution)}`,
    );
  }
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function sh(command: string, args: string[], cwd = repoDir): string {
  return execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
}
