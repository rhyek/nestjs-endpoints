import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createInstalledProject,
  filesIn,
  linkPackage,
  platformPackage,
  run,
} from './installed-project';

// The project the routing specs run: one made the way Nest's First steps guide makes one, with
// `nest new`, and with nestjs-endpoints added to it the way Getting started says. Its
// `package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, lint, format and test
// configs are the ones the Nest CLI wrote, so the specs run the setup a new Nest project has.
//
// Its packages are this test app's, linked: see `installed-project.ts`.

/** For the hook that makes the project: it runs the Nest CLI, among several others doing so. */
export const SETUP_TIMEOUT = 120_000;

/** The Nest CLI, from the project's directory. */
export const NEST = 'node_modules/@nestjs/cli/bin/nest.js';

/**
 * Source that gets the HTTP adapter of this test app as `Adapter`, for the app and the specs
 * that run in the project: it is named by `PLATFORM_PACKAGE`, which `start` and `runOnce` set.
 */
export const adapterSource = `const platform: Record<string, unknown> = await import(process.env.PLATFORM_PACKAGE!);
const Adapter = Object.entries(platform).find(([name]) =>
  name.endsWith('Adapter'),
)![1] as new () => never;`;

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

// Endpoints with an output map, one of its statuses described, and a router's `params`, which no
// route serves: the project's build emits their declarations as it does those of its endpoint
// files, and fails on a type it cannot name from outside the package.
const declaredSource = `import { EndpointRouter, endpoint, z } from 'nestjs-endpoints';

export const created = endpoint.mutation({
  path: 'declared/created',
  input: z.object({ name: z.string() }),
  output: {
    201: z.object({ id: z.number() }).meta({ description: 'Created' }),
    409: z.object({ message: z.string() }),
  },
  handler: ({ input, response }) =>
    input.name ? response(201, { id: 1 }) : response(409, { message: 'taken' }),
});

export const router = EndpointRouter.create({
  basePath: 'declared',
  context: { params: z.object({ id: z.coerce.number() }) },
});

export const viewed = router.endpoint.query({
  path: ':id/view',
  output: z.object({ id: z.number() }),
  handler: ({ params }) => ({ id: params.id }),
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

${adapterSource}

async function bootstrap() {
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

/** The lines in which the app reported its routes: one each time it started. */
const statusLines = (output: string) =>
  output.split('\n').filter((line) => line.startsWith('statuses '));

/** What the app last printed about its routes: those that answered 200. */
function lastServed(output: string): Served | undefined {
  const line = statusLines(output).at(-1);
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

// A router for a folder of endpoints, which gives them a namespace in the generated client.
// A nested router is a module of its own, so it provides what its endpoints inject.
const routerSource = (depth: number) => `import { EndpointRouter } from 'nestjs-endpoints';
import { Clock, HealthService } from '${'../'.repeat(depth)}health.service.js';

export default EndpointRouter.create({
  namespace: true,
  providers: [Clock, HealthService],
});
`;

/** A process the specs started in the project, and what it has printed. */
export type Started = {
  output: string;
  exited: Promise<number | null>;
  /** The routes the app served when it last reported them, if it has. */
  served(): Served | undefined;
  /** How many times the app has started: it reports its routes once each time. */
  starts(): number;
  stop(): void;
};

/** How a run of the app ended: whether it failed, what it printed, the routes it served. */
export type Booted = { failed: boolean; output: string; served: Served | undefined };

export type NestProject = Awaited<ReturnType<typeof createNestProject>>;

/**
 * Makes the project in a temporary directory: `nest new`, then nestjs-endpoints installed and
 * set up in the app module. It has no endpoint files yet, only `src/declared.ts`.
 */
export async function createNestProject(prefix: string) {
  const directory = await createInstalledProject(prefix);
  const platform = await platformPackage();

  // What the project's own scripts and config need, beyond what the package does.
  for (const name of ['@nestjs/cli', '@nestjs/testing', 'vitest']) {
    await linkPackage(directory, name);
  }

  // As the guide's own command for a script has it; `--skip-install` because the packages are
  // linked, and `--no-observe` to leave out an SDK that reports to a hosted service.
  const scaffold = path.join(directory, 'scaffold');
  const generating = run(
    process.execPath,
    [
      NEST,
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

  /**
   * The package's `postinstall`, as a package manager runs it: in the package's directory, with
   * `INIT_CWD` the project's, and outside CI.
   */
  const postinstall = () => {
    const { CI: _, NESTJS_ENDPOINTS_SKIP_AGENT_FILES: __, ...inherited } = process.env;
    return run(process.execPath, ['postinstall.js'], {
      cwd: path.join(directory, 'node_modules/nestjs-endpoints'),
      env: { ...inherited, INIT_CWD: directory },
    });
  };
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
  await writeFile(path.join(directory, 'src/declared.ts'), declaredSource);

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
  function spawnNode(args: string[], env: Record<string, string>): Started {
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
      served: () => lastServed(started.output),
      starts: () => statusLines(started.output).length,
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

  return {
    directory,
    appModule,
    endpointFile,
    addEndpoint,

    /** Starts `node` with `args` in the project, and keeps the app up until it is stopped. */
    start: (args: string[], env: Record<string, string> = {}): Started =>
      spawnNode(args, { STAY_UP: 'true', ...env }),

    /** Runs `node` with `args` in the project to its end. */
    async runOnce(args: string[], env: Record<string, string> = {}): Promise<Booted> {
      const started = spawnNode(args, env);
      const timeout = setTimeout(() => started.stop(), 90_000);
      try {
        const code = await started.exited;
        return { failed: code !== 0, output: started.output, served: started.served() };
      } finally {
        clearTimeout(timeout);
      }
    },

    /** The package's `postinstall`, run in the project. */
    postinstall,

    /** Gives the folder `src/endpoints/<folder>` a `router.ts`, with a namespace. */
    async addRouter(folder: string) {
      const file = path.join(directory, 'src/endpoints', folder, 'router.ts');
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, routerSource(folder.split('/').length + 1));
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
            (await stat(path.join(directory, name))).isDirectory()
              ? (await filesIn(path.join(directory, name))).map((file) => path.join(name, file))
              : [name],
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
