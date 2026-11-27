import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Ran, run, Running, start } from './processes';

// The project the journey works on: a copy of `assets/project`, a monorepo with an empty NestJS
// API and an empty TanStack Router app, in a temporary directory. The spec edits its files and
// runs its package manager and scripts, as a developer would.

const template = path.resolve(import.meta.dirname, '../assets/project');

/** The package manager this spec was started with, so the project is installed by the same one. */
const packageManager = process.env.npm_execpath ?? 'pnpm';

/** A package of the project: one of its two apps, or the library the journey adds. */
export type App = 'api' | 'web' | 'shared-backend';

/** A file of the generated client: what it holds, and when it was last written. */
export type ClientFile = { content: string; modified: number };

export type Sandbox = Awaited<ReturnType<typeof createSandbox>>;

export async function createSandbox() {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'journey-')));
  await cp(template, directory, { recursive: true });

  // An environment that says nothing of where the apps run. The Node.js and the package
  // manager that run this spec come first on the path, for the scripts the project runs.
  const { NODE_ENV: _, CI: __, ...inherited } = process.env;
  const env: NodeJS.ProcessEnv = {
    ...inherited,
    PATH: [path.dirname(process.execPath), path.dirname(packageManager), inherited.PATH].join(
      path.delimiter,
    ),
  };
  const options = { cwd: directory, env };
  const command = /\.[cm]?js$/.test(packageManager)
    ? { file: process.execPath, args: [packageManager] }
    : { file: packageManager, args: [] };

  const at = (file: string) => path.join(directory, file);

  const exists = (file: string) =>
    stat(at(file)).then(
      () => true,
      () => false,
    );

  /** The files under `folder`, by their path from the project. */
  async function filesUnder(folder: string): Promise<string[]> {
    const entries = await readdir(at(folder), { recursive: true, withFileTypes: true }).catch(
      () => [],
    );
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)));
  }

  /** Runs a script of an app to its end, with `extra` in its environment. */
  const runScript = (app: App, script: string, extra: NodeJS.ProcessEnv = {}): Promise<Ran> =>
    run(command.file, [...command.args, '--filter', app, 'run', script], {
      cwd: directory,
      env: { ...env, ...extra },
    });

  return {
    directory,
    at,

    /** Runs the package manager in the project, to its end. */
    pnpm: (...args: string[]): Promise<Ran> =>
      run(command.file, [...command.args, ...args], options),

    runScript,

    /** Starts a script of an app that stays up, with `args` after it. */
    startScript: (
      app: App,
      script: string,
      args: string[],
      extra: NodeJS.ProcessEnv = {},
    ): Running =>
      start(command.file, [...command.args, '--filter', app, 'run', script, ...args], {
        cwd: directory,
        env: { ...env, ...extra },
      }),

    /** Runs an app's type check: `tsc --noEmit`. */
    typecheck: (app: App): Promise<Ran> => runScript(app, 'typecheck'),

    read: (file: string) => readFile(at(file), 'utf-8'),

    /** Where a file of the project really is, past every link on the way. */
    real: (file: string) => realpath(path.isAbsolute(file) ? file : at(file)),

    async write(file: string, source: string) {
      await mkdir(path.dirname(at(file)), { recursive: true });
      await writeFile(at(file), source);
    },

    remove: (file: string) => rm(at(file), { recursive: true, force: true }),

    rename: (from: string, to: string) => rename(at(from), at(to)),

    /** Marks a file as changed, as saving it again does. */
    async touch(file: string) {
      const now = new Date();
      await utimes(at(file), now, now);
    },

    exists,

    /**
     * The client the API generates for the web app: `apps/web/src/api-client.tsx`, and every
     * file of the folder beside it.
     */
    async client(): Promise<Record<string, ClientFile>> {
      const files = [
        ...((await exists('apps/web/src/api-client.tsx')) ? ['apps/web/src/api-client.tsx'] : []),
        ...(await filesUnder('apps/web/src/api-client')),
      ].sort();
      const client: Record<string, ClientFile> = {};
      for (const file of files) {
        client[file] = {
          content: await readFile(at(file), 'utf-8'),
          modified: (await stat(at(file))).mtimeMs,
        };
      }
      return client;
    },

    destroy: () => rm(directory, { recursive: true, force: true }),
  };
}

/** What each file of a client holds, without when it was written. */
export const contentsOf = (client: Record<string, ClientFile>) =>
  Object.fromEntries(Object.entries(client).map(([file, { content }]) => [file, content]));
