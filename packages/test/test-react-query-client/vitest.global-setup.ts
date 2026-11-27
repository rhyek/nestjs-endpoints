import { spawn } from 'node:child_process';
import path from 'node:path';
import { API_PORT } from './ports';

// The app these specs call: test-app-express, built (`pnpm --filter test-app-express build`)
// and run as a consumer runs it, with `node`, from its own directory, where it writes the
// client the specs import. It is up from before the first spec to after the last.

const app = path.resolve(import.meta.dirname, '../test-app-express');
const LISTENING = `Server is running on port ${API_PORT}`;
const STARTUP_TIMEOUT = 60_000;

export default async function startApp() {
  // An environment that says nothing of where the app runs, but for its port.
  const { NODE_ENV: _, ...inherited } = process.env;
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: app,
    env: { ...inherited, PORT: String(API_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const exited = new Promise<void>((resolve) => child.on('exit', () => resolve()));

  async function stop() {
    child.kill('SIGTERM');
    const forced = setTimeout(() => child.kill('SIGKILL'), 5_000);
    await exited;
    clearTimeout(forced);
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`test-app-express did not listen within 60 seconds:\n${output}`)),
        STARTUP_TIMEOUT,
      );
      child.stdout.on('data', () => {
        if (output.includes(LISTENING)) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`test-app-express exited (${code}) before it listened:\n${output}`));
      });
    });
  } catch (error) {
    await stop();
    throw error;
  }
  return stop;
}
