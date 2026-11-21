import { rename, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  createNestProject,
  lastServed,
  NestProject,
  Served,
  SETUP_TIMEOUT,
  Started,
} from './nest-project';

// What file-based routing does in each way an app is run: compiled by the Nest CLI, and with
// `node` and a loader that compiles TypeScript (SWC's, oxc's). Each has a spec file of its own,
// which calls `describeRouting()` with how that runtime starts an app. The scenarios are the
// same for all of them: the app started once and started under the runtime's watcher, whatever
// `NODE_ENV` and `CI` say.
//
// The app is the project `nest new` makes, with the package added to it: see `nest-project.ts`.

export type Runtime = {
  /** As the test titles name it: `nest start`. */
  name: string;
  /** The `node` arguments that run the app once. */
  once: string[];
  /** Those that run it under the runtime's watcher, and what the titles call that. */
  watch: { name: string; args: string[] };
  /**
   * Whether the watcher restarts the app for a file nothing imports yet. The Nest CLI's does:
   * it compiles the new file. `node --watch` restarts for the files the app imported, so the
   * app has to turn the package's `watch` on.
   */
  restartsForNewFiles: boolean;
  /** Adds to the project the packages the runtime needs. */
  prepare: (directory: string) => Promise<void>;
};

const WAIT = { timeout: 30_000, interval: 100 };

/** How many times the app has started: it reports its routes once each time. */
const starts = (output: string) =>
  output.split('\n').filter((line) => line.startsWith('statuses ')).length;

// Every environment an app is started in. None of them changes what it serves.
const environments: [name: string, env: Record<string, string>][] = [
  ['no NODE_ENV', {}],
  ['NODE_ENV=development', { NODE_ENV: 'development' }],
  ['NODE_ENV=test', { NODE_ENV: 'test' }],
  ['NODE_ENV=production', { NODE_ENV: 'production' }],
  ['CI and no NODE_ENV', { CI: 'true' }],
  ['CI and NODE_ENV=development', { CI: 'true', NODE_ENV: 'development' }],
  ['CI and NODE_ENV=test', { CI: 'true', NODE_ENV: 'test' }],
];

export function describeRouting(runtime: Runtime) {
  // Every test starts a process or several, and the Nest CLI compiles the app first.
  describe(`an app run with ${runtime.name}`, { timeout: 120_000 }, () => {
    let project: NestProject;

    // What turns the package's `watch` on in the project's app module.
    const watchOn = { WATCH: 'true' };

    beforeAll(async () => {
      project = await createNestProject('routing-');
      await runtime.prepare(project.directory);
    }, SETUP_TIMEOUT);

    afterAll(async () => {
      await project?.remove();
    });

    type Booted = Awaited<ReturnType<NestProject['runOnce']>>;

    /** Runs the app to its end. */
    const runOnce = (env: Record<string, string> = {}) => project.runOnce(runtime.once, env);

    /** Starts the app under the runtime's watcher, and stops it once it has answered its routes. */
    async function runWatched(env: Record<string, string> = {}): Promise<Booted> {
      const app = project.start(runtime.watch.args, { STAY_UP: 'true', ...env });
      try {
        await vi.waitFor(() => {
          if (!lastServed(app.output)) {
            throw new Error(`The app has not started:\n${app.output}`);
          }
        }, WAIT);
        return { failed: false, output: app.output, served: lastServed(app.output) };
      } finally {
        app.stop();
      }
    }

    // The two ways the runtime starts an app.
    const modes = [
      { name: runtime.name, boot: runOnce },
      { name: runtime.watch.name, boot: runWatched },
    ];

    describe.each(modes)('started with $name', ({ boot }) => {
      test.each(environments)(
        'serves the endpoint files that are there, and writes nothing (%s)',
        async (_, env) => {
          await project.endpoints('a', 'b');
          const before = await project.files();

          const { served, output } = await boot(env);

          expect(served, output).toEqual(['a', 'b']);
          expect(await project.files()).toEqual(before);
        },
      );

      test('no longer serves an endpoint file deleted while it was stopped', async () => {
        await project.endpoints('a', 'b');
        // A first run, so that a compiled app has built both.
        await runOnce();
        await rm(project.endpointFile('a'));

        const { served, output } = await boot();

        expect(served, output).toEqual(['b']);
      });
    });

    // One app, left running: each test changes the endpoint files under it, in this order.
    describe(`while it runs under ${runtime.watch.name}`, () => {
      let app: Started;

      const serves = (expected: Served, wait = WAIT) =>
        vi.waitFor(() => expect(lastServed(app.output)).toEqual(expected), wait);

      /**
       * Makes a change to the endpoint files until the app serves `expected`. A watcher can
       * miss what happens in its first moments (macOS FSEvents does), and the app has just
       * restarted when a test begins.
       */
      async function until(expected: Served, change: () => Promise<void>) {
        for (let attempt = 1; ; attempt++) {
          await change();
          try {
            await serves(expected, { timeout: 8_000, interval: 100 });
            return;
          } catch (error) {
            if (attempt === 4) {
              // What the app and its watcher said, for whoever reads the failure.
              console.error(app.output);
              throw error;
            }
          }
        }
      }

      beforeAll(async () => {
        await project.endpoints('a', 'b');
        // As on the project's first run: with `watch` on, the app creates the file its watcher
        // restarts for, and must not restart for having created it.
        await rm(path.join(project.directory, 'node_modules/.cache'), {
          recursive: true,
          force: true,
        });
        app = project.start(runtime.watch.args, {
          STAY_UP: 'true',
          ...(runtime.restartsForNewFiles ? {} : watchOn),
        });
      });

      afterAll(() => {
        app?.stop();
      });

      test('serves its endpoint files, and starts once, on a first run too', async () => {
        await serves(['a', 'b']);
        // Long enough for a watcher to restart an app that had changed a file it watches.
        await new Promise((resolve) => setTimeout(resolve, 2000));
        expect(starts(app.output)).toBe(1);
      });

      test('serves an endpoint file added to it', async () => {
        await until(['a', 'b', 'c'], () => project.addEndpoint('c'));
      });

      test('serves an endpoint file added in a new folder', async () => {
        await until(['a', 'b', 'c', 'shop/e'], () => project.addEndpoint('shop/e'));
      });

      test('serves a renamed endpoint file by its new name', async () => {
        await until(['a', 'b', 'd', 'shop/e'], async () => {
          await rename(project.endpointFile('c'), project.endpointFile('d')).catch(() => {});
        });
      });

      test('stops serving a deleted endpoint file', async () => {
        await until(['a', 'd', 'shop/e'], () => rm(project.endpointFile('b'), { force: true }));
      });
    });

    // What someone does to add a part to an API, with the app running: a folder, an endpoint
    // file in it, then a router module to give it a namespace. Each step is served, and is in
    // the client the app generates when it starts.
    describe(`a new endpoint folder, while it runs under ${runtime.watch.name}`, () => {
      let app: Started;

      /** Makes a change until `reached` holds: see `until()` above for why it is repeated. */
      async function until(change: () => Promise<void>, reached: () => Promise<void>) {
        for (let attempt = 1; ; attempt++) {
          await change();
          try {
            await vi.waitFor(reached, { timeout: 10_000, interval: 100 });
            return;
          } catch (error) {
            if (attempt === 4) {
              console.error(app.output);
              throw error;
            }
          }
        }
      }

      beforeAll(async () => {
        // No endpoint folder at all, as in a project that has just added the package.
        await project.endpoints();
        app = project.start(runtime.watch.args, {
          STAY_UP: 'true',
          CODEGEN: 'true',
          ...(runtime.restartsForNewFiles ? {} : watchOn),
        });
      });

      afterAll(() => {
        app?.stop();
      });

      test('starts with no endpoint folder: nothing to serve, and a client with no operations', async () => {
        await vi.waitFor(() => expect(lastServed(app.output)).toEqual([]), WAIT);
        expect(await project.generatedClient()).not.toMatch(/bindClient\(_ops\./);
      });

      test('serves an endpoint file added in a new endpoint folder, and has it in the client', async () => {
        await until(
          () => project.addEndpoint('shop/e'),
          async () => {
            expect(lastServed(app.output)).toEqual(['shop/e']);
            expect(await project.generatedClient()).toMatch(
              /^\s+shopE: bindClient\(_ops\.shopE, _client\),$/m,
            );
          },
        );
      });

      test('nests it in the client once the folder has a router module with a namespace', async () => {
        await until(
          () => project.addRouterModule('shop'),
          async () => {
            expect(await project.generatedClient()).toMatch(
              /^\s+shop: \{\n\s+e: bindClient\(_ops\.shopE, _client\),$/m,
            );
            expect(lastServed(app.output)).toEqual(['shop/e']);
          },
        );
      });
    });

    if (!runtime.restartsForNewFiles) {
      test(`started with ${runtime.name} and \`watch\` on, serves its endpoint files and ends by itself`, async () => {
        await project.endpoints('a', 'b');

        const { failed, served, output } = await runOnce(watchOn);

        expect(served, output).toEqual(['a', 'b']);
        expect(failed).toBe(false);
      });

      // What `watch` is for: without it, this watcher never learns of the new file.
      test(`under ${runtime.watch.name} with \`watch\` off, a new endpoint file waits for a restart`, async () => {
        await project.endpoints('a', 'b');
        const app = project.start(runtime.watch.args, { STAY_UP: 'true' });
        try {
          await vi.waitFor(() => expect(lastServed(app.output)).toEqual(['a', 'b']), WAIT);
          expect(starts(app.output)).toBe(1);

          await project.addEndpoint('c');
          await new Promise((resolve) => setTimeout(resolve, 3000));

          expect(starts(app.output)).toBe(1);
          expect(lastServed(app.output)).toEqual(['a', 'b']);
        } finally {
          app.stop();
        }
      });
    }
  });
}
