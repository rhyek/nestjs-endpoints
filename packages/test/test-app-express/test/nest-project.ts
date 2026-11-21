import { spawn } from 'node:child_process';
import {
  cp,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { createInstalledProject, platformPackage, run } from './installed-project';

// The project the routing specs run: one made the way Nest's First steps guide makes one, with
// `nest new`, and with nestjs-endpoints added to it the way Getting started says. Its
// `package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, lint, format and test
// configs are the ones the Nest CLI wrote, so the specs run the setup a new Nest project has.
//
// Its packages are this test app's, linked: nothing is installed from the network.

const modulesOf = {
  /** This test app's packages. */
  app: path.resolve(import.meta.dirname, '../node_modules'),
  /** The workspace's own, which every package in it shares. */
  workspace: path.resolve(import.meta.dirname, '../../../../node_modules'),
};

/** For the hook that makes the project: it runs the Nest CLI, among several others doing so. */
export const SETUP_TIMEOUT = 120_000;

/** The Nest CLI, from the project's directory. */
export const NEST = 'node_modules/@nestjs/cli/bin/nest.js';

/** Links a package this test app (or the workspace) depends on into the project at `directory`. */
export async function linkPackage(
  directory: string,
  name: string,
  from: keyof typeof modulesOf = 'app',
): Promise<void> {
  const link = path.join(directory, 'node_modules', name);
  await mkdir(path.dirname(link), { recursive: true });
  await symlink(await realpath(path.join(modulesOf[from], name)), link);
}

/**
 * Installs a copy of a package this test app depends on into the project at `directory`, with
 * links to its dependencies. Unlike a link, a copy finds its peers in the project: pnpm gave
 * the package this test app's own, among them a TypeScript the project replaces.
 */
export async function copyPackage(directory: string, name: string) {
  const source = await realpath(path.join(modulesOf.app, name));
  const modules = path.join(directory, 'node_modules');
  await cp(source, path.join(modules, name), { recursive: true });
  // pnpm installs a package's dependencies beside it.
  const beside = path.resolve(source, ...name.split('/').map(() => '..'));
  const { dependencies = {} } = JSON.parse(
    await readFile(path.join(source, 'package.json'), 'utf-8'),
  );
  for (const dependency of Object.keys(dependencies)) {
    await mkdir(path.dirname(path.join(modules, dependency)), { recursive: true });
    await symlink(await realpath(path.join(beside, dependency)), path.join(modules, dependency));
  }
}

/**
 * Gives the project the TypeScript a new Nest project has, version 6, in place of the
 * workspace's 7: the Nest CLI and SWC's loader read the project's config through the compiler
 * API, which TypeScript 7 doesn't have. It is the one the Nest CLI itself depends on, which
 * pnpm installs beside it.
 */
export async function linkTypescriptWithApi(directory: string) {
  const cli = await realpath(path.join(modulesOf.app, '@nestjs/cli'));
  const link = path.join(directory, 'node_modules/typescript');
  await rm(link, { recursive: true });
  await symlink(await realpath(path.join(cli, '../../typescript')), link);
}

// The routes the app asks itself for, each named by its endpoint file under `src/endpoints`.
const ROUTES = ['a', 'b', 'c', 'd', 'shop/e'] as const;
type Route = (typeof ROUTES)[number];

/** The routes that answered 200; every other one answered 404. */
export type Served = Route[];

// Written as Nest providers are. Nest injects `Clock` by the type of the constructor's
// parameter, which it knows only if the runtime emitted the decorator's metadata.
const healthServiceSource = `import { Injectable } from '@nestjs/common';

@Injectable()
export class Clock {
  now() {
    return Date.now();
  }
}

@Injectable()
export class HealthService {
  constructor(private readonly clock: Clock) {}

  ok() {
    return this.clock.now() > 0;
  }
}
`;

/** An endpoint file `depth` folders under `src/`. */
const endpointSource = (depth: number) => `import { endpoint, z } from 'nestjs-endpoints';
import { HealthService } from '${'../'.repeat(depth)}health.service.js';

export default endpoint.query({
  method: 'get',
  output: z.object({ ok: z.boolean() }),
  inject: { health: HealthService },
  handler: ({ health }) => ({ ok: health.ok() }),
});
`;

// What Getting started adds to the app module. `watch` is the app's own choice: the specs turn
// it on through the environment, for the runtimes that need it.
const routerImports = `import { NestjsEndpoints } from 'nestjs-endpoints';
import { Clock, HealthService } from './health.service.js';`;
const routerModule = `imports: [
    NestjsEndpoints.forRoot({
      router: {
        rootDirectory: './endpoints',
        providers: [Clock, HealthService],
      },
      watch: process.env.WATCH === 'true',
    }),
  ],`;

// `main.ts` as `nest new` writes it, but for three things. Asked to, it generates a client
// from the app, as the Codegen guide has an app do. The adapter is this test app's. And the app
// listens on a free port, asks itself for each route, prints the statuses, and stays up only
// when asked to: the specs start many at once.
const mainSource = `import { NestFactory } from '@nestjs/core';
import { setupCodegen } from 'nestjs-endpoints';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const platform: Record<string, unknown> = await import(process.env.PLATFORM_PACKAGE!);
  const Adapter = Object.entries(platform).find(([name]) =>
    name.endsWith('Adapter'),
  )![1] as new () => never;
  const app = await NestFactory.create(AppModule, new Adapter(), { logger: ['error'] });
  if (process.env.CODEGEN) {
    await setupCodegen(app, {
      clients: [{ type: 'axios', outputFile: process.cwd() + '/generated/client.ts' }],
    });
  }
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();

  const statuses: Record<string, number> = {};
  for (const route of ${JSON.stringify(ROUTES)}) {
    statuses[route] = (await fetch(url + '/' + route)).status;
  }
  console.log('statuses ' + JSON.stringify(statuses));
  if (!process.env.STAY_UP) {
    await app.close();
  }
}
await bootstrap();
`;

/** What the app last printed about its routes: those that answered 200. */
export function lastServed(output: string): Served | undefined {
  const line = output.split('\n').findLast((candidate) => candidate.startsWith('statuses '));
  if (!line) {
    return undefined;
  }
  const statuses: Record<Route, number> = JSON.parse(line.slice('statuses '.length));
  for (const [route, status] of Object.entries(statuses)) {
    if (status !== 200 && status !== 404) {
      throw new Error(`/${route} answered ${status}`);
    }
  }
  return ROUTES.filter((route) => statuses[route] === 200);
}

// A router module for a folder of endpoints, which gives them a namespace in the generated
// client. A nested router is a module of its own, so it provides what its endpoints inject.
const routerModuleSource = (
  depth: number,
) => `import { EndpointRouterModule } from 'nestjs-endpoints';
import { Clock, HealthService } from '${'../'.repeat(depth)}health.service.js';

export default EndpointRouterModule.create({
  namespace: true,
  providers: [Clock, HealthService],
});
`;

/** A process the specs started in the project, and what it has printed. */
export type Started = {
  output: string;
  exited: Promise<number | null>;
  stop(): void;
};

/** How a run of the app ended: whether it failed, what it printed, the routes it served. */
export type Booted = { failed: boolean; output: string; served: Served | undefined };

export type NestProject = Awaited<ReturnType<typeof createNestProject>>;

/**
 * Makes the project in a temporary directory: `nest new`, then nestjs-endpoints installed and
 * set up in the app module. It has no endpoint files yet.
 */
export async function createNestProject(prefix: string) {
  const directory = await createInstalledProject(prefix);
  const platform = await platformPackage();

  // As the guide's own command for a script has it; `--skip-install` because the packages are
  // linked, and `--no-observe` to leave out an SDK that reports to a hosted service.
  const scaffold = path.join(directory, 'scaffold');
  const generating = run(
    process.execPath,
    [
      path.join(modulesOf.app, '@nestjs/cli/bin/nest.js'),
      'new',
      path.basename(scaffold),
      '--skip-git',
      '--skip-install',
      '--no-observe',
      '--package-manager',
      'npm',
    ],
    { cwd: directory },
  );
  // It asks nothing of a process with no terminal.
  generating.child.stdin?.end();
  await generating;
  for (const entry of await readdir(scaffold)) {
    await rename(path.join(scaffold, entry), path.join(directory, entry));
  }
  await rm(scaffold, { recursive: true });

  // What the project's own scripts and config need, beyond what the package does.
  for (const name of ['@nestjs/cli', '@nestjs/testing', 'vitest']) {
    await linkPackage(directory, name);
  }

  const cli = (...args: string[]) =>
    run(process.execPath, ['node_modules/nestjs-endpoints/dist/cli.js', ...args], {
      cwd: directory,
    });
  const appModule = path.join(directory, 'src/app.module.ts');
  const scaffolded = await readFile(appModule, 'utf-8');
  const lastImport = "import { AppService } from './app.service.js';";
  if (!scaffolded.includes(lastImport) || !scaffolded.includes('imports: [],')) {
    throw new Error(`\`nest new\` no longer writes the app module this expects:\n${scaffolded}`);
  }
  await writeFile(
    appModule,
    scaffolded
      .replace(lastImport, `${lastImport}\n${routerImports}`)
      .replace('imports: [],', routerModule),
  );
  await writeFile(path.join(directory, 'src/health.service.ts'), healthServiceSource);
  await writeFile(path.join(directory, 'src/main.ts'), mainSource);

  const endpointFile = (route: string) =>
    path.join(directory, `src/endpoints/${route}.endpoint.ts`);

  async function addEndpoint(route: string) {
    await mkdir(path.dirname(endpointFile(route)), { recursive: true });
    await writeFile(endpointFile(route), endpointSource(route.split('/').length));
  }

  /**
   * Starts `node` with `args` in the project, in a process group of its own, so that stopping
   * it also stops what it started: the Nest CLI runs the app in a child process, and so does
   * `node --watch`.
   */
  function start(args: string[], env: Record<string, string> = {}): Started {
    // An environment that says nothing of where the app runs, but for `env`.
    const { NODE_ENV: _, CI: __, ...inherited } = process.env;
    const child = spawn(process.execPath, args, {
      cwd: directory,
      env: { ...inherited, PLATFORM_PACKAGE: platform, ...env },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const started: Started = {
      output: '',
      exited: new Promise<number | null>((resolve) => child.on('exit', resolve)),
      stop() {
        try {
          process.kill(-child.pid!);
        } catch {
          // It has exited.
        }
      },
    };
    child.stdout.on('data', (chunk) => (started.output += chunk));
    child.stderr.on('data', (chunk) => (started.output += chunk));
    return started;
  }

  /** The files under `dir`, relative to the project, sorted. */
  async function filesIn(dir: string): Promise<string[]> {
    const entries = await readdir(path.join(directory, dir), {
      recursive: true,
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
      .sort();
  }

  return {
    directory,
    appModule,
    endpointFile,
    addEndpoint,
    start,

    /** Runs `node` with `args` in the project to its end. */
    async runOnce(args: string[], env: Record<string, string> = {}): Promise<Booted> {
      const started = start(args, env);
      const timeout = setTimeout(() => started.stop(), 90_000);
      try {
        const code = await started.exited;
        return {
          failed: code !== 0,
          output: started.output,
          served: lastServed(started.output),
        };
      } finally {
        clearTimeout(timeout);
      }
    },

    /** The `nestjs-endpoints` command, run in the project. */
    cli,

    /** Gives the folder `src/endpoints/<folder>` a router module with a namespace. */
    async addRouterModule(folder: string) {
      const file = path.join(directory, 'src/endpoints', folder, 'router.module.ts');
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, routerModuleSource(folder.split('/').length + 1));
    },

    /** The client the app generated when it last started with `CODEGEN` set, if it has. */
    generatedClient: () =>
      readFile(path.join(directory, 'generated/client.ts'), 'utf-8').catch(() => undefined),

    /**
     * Every file of the project that a run of the app could add to or change: all but its
     * packages, and what the compiler writes (the build output, and the `.tsbuildinfo` an
     * incremental build keeps beside `tsconfig.build.json`). A run must leave these as they
     * were.
     */
    async files(): Promise<string[]> {
      const top = await readdir(directory);
      const nested = await Promise.all(
        top
          .filter(
            (name) => name !== 'node_modules' && name !== 'dist' && !name.endsWith('.tsbuildinfo'),
          )
          .map(async (name) =>
            (await stat(path.join(directory, name))).isDirectory() ? filesIn(name) : [name],
          ),
      );
      return nested.flat().sort();
    },

    /** Only the endpoint files of `routes`, and nothing built. */
    async endpoints(...routes: Route[]) {
      await rm(path.join(directory, 'src/endpoints'), { recursive: true, force: true });
      await rm(path.join(directory, 'dist'), { recursive: true, force: true });
      await rm(path.join(directory, 'generated'), { recursive: true, force: true });
      for (const route of routes) {
        await addEndpoint(route);
      }
    },

    remove: () => rm(directory, { recursive: true, force: true }),
  };
}
