import { spawn } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';

// The processes the journey starts: commands that run to their end, and the two dev servers,
// which stay up while the spec edits files under them.

/** A process that has ended: whether it failed, and what it printed. */
export type Ran = { failed: boolean; output: string };

/** A process that is running, and what it has printed so far. */
export type Running = {
  /** Everything it has printed. */
  output(): string;
  /** A place in its output, to read what it prints from here on with `since()`. */
  mark(): number;
  since(mark: number): string;
  /** Stops it and everything it started, and resolves once it has ended. */
  stop(): Promise<void>;
};

type Options = { cwd: string; env: NodeJS.ProcessEnv };

/** Runs a command to its end. */
export function run(command: string, args: string[], { cwd, env }: Options): Promise<Ran> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', reject);
    // Once its output is read to the end: a process can exit before all it wrote has arrived.
    child.on('close', (code) => resolve({ failed: code !== 0, output }));
  });
}

/**
 * Starts a command that stays up, in a process group of its own: a dev server runs through a
 * package manager and a watcher, and stopping it stops the group, so that nothing it started is
 * left behind. Only this group is ever signalled.
 */
export function start(command: string, args: string[], { cwd, env }: Options): Running {
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const exited = new Promise<void>((resolve) => child.on('exit', () => resolve()));
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-child.pid!, name);
    } catch {
      // The group has ended.
    }
  };
  return {
    output: () => output,
    mark: () => output.length,
    since: (mark) => output.slice(mark),
    async stop() {
      signal('SIGTERM');
      const forced = setTimeout(() => signal('SIGKILL'), 5_000);
      await exited;
      clearTimeout(forced);
      // What the group's leader started may outlive it by a moment.
      signal('SIGKILL');
    },
  };
}

/** Without colors and cursor movements, which a terminal reads and a spec does not. */
export const plain = stripVTControlCharacters;
