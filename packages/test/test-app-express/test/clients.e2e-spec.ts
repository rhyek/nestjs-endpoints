import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { copyPackage, linkPackage, linkTypescriptWithApi } from './installed-project';
import {
  adapterSource,
  CLI,
  createNestProject,
  NEST,
  NestProject,
  SETUP_TIMEOUT,
} from './nest-project';

// The clients an app declares in `NestjsEndpoints.forRoot({ clients })`, in the project `nest
// new` makes: written as the app starts, by `nestjs-endpoints generate`, and by a script of the
// app's own, neither of which starts it. The project's app module declares one when
// `ROOT_CLIENTS` is set.

const BUILD = [NEST, 'build'];
const START = [NEST, 'start'];
const declared = { ROOT_CLIENTS: 'true' };

/** The URLs a client's request functions call. */
const urlsIn = (client: string | undefined) =>
  [...(client ?? '').matchAll(/url: `?'?([^'`,]+)/g)].map(([, url]) => url).sort();

// The script the Codegen guide gives an app that sets a global prefix, to write its clients
// with: as the guide has it, but for the adapter, which is this test app's.
const codegenSource = `import { NestFactory } from '@nestjs/core';
import { setupCodegen } from 'nestjs-endpoints';
import { AppModule } from './app.module.js';
${adapterSource}

const app = await NestFactory.create(AppModule, new Adapter(), {
  preview: true,
});
app.setGlobalPrefix('api');
await setupCodegen(app, { forceGenerate: true });
`;

// What a run of the app prints: its providers made and started, its routes answered.
const STARTED = ['probe constructed', 'probe initialized', 'statuses '];
/** Which of those `output` has. */
const startedIn = (output: string) => STARTED.filter((line) => output.includes(line));

describe('the clients an app declares in NestjsEndpoints.forRoot', { timeout: 120_000 }, () => {
  let project: NestProject;

  beforeAll(async () => {
    project = await createNestProject('clients-');
    await linkPackage(project.directory, '@oxc-node/core');
    await copyPackage(project.directory, '@swc-node/register');
    await linkPackage(project.directory, '@swc/core');
    await linkTypescriptWithApi(project.directory);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await project?.remove();
  });

  beforeEach(async () => {
    await project.endpoints('a', 'b');
  });

  describe('as the app starts', () => {
    test('are written', async () => {
      const { served, output } = await project.runOnce(START, declared);

      expect(served, output).toEqual(['a', 'b']);
      // What the command and the script below must not print, printed by a start.
      expect(startedIn(output)).toEqual(STARTED);
      expect(urlsIn(await project.rootClient())).toEqual(['/a', '/b']);
    });

    test('have the global prefix `main.ts` gives the app', async () => {
      const { failed, output } = await project.runOnce(START, {
        ...declared,
        GLOBAL_PREFIX: 'api',
      });

      expect(failed, output).toBe(false);
      expect(urlsIn(await project.rootClient())).toEqual(['/api/a', '/api/b']);
    });

    test.each([
      ['test', 'as a test runner sets it'],
      ['production', 'as a deployment sets it'],
    ])('are not written with NODE_ENV=%s, %s', async (NODE_ENV) => {
      const { served, output } = await project.runOnce(START, { ...declared, NODE_ENV });

      expect(served, output).toEqual(['a', 'b']);
      expect(await project.rootClient()).toBeUndefined();
    });

    test('are written with NODE_ENV=development', async () => {
      const { served, output } = await project.runOnce(START, {
        ...declared,
        NODE_ENV: 'development',
      });

      expect(served, output).toEqual(['a', 'b']);
      expect(urlsIn(await project.rootClient())).toEqual(['/a', '/b']);
    });

    test('are not written with `generateClientsOnStart` off', async () => {
      const { served, output } = await project.runOnce(START, { ...declared, ON_START: 'false' });

      expect(served, output).toEqual(['a', 'b']);
      expect(await project.rootClient()).toBeUndefined();
    });
  });

  describe('with `nestjs-endpoints generate`', () => {
    /** Runs the command, and fails with what it printed if it did. */
    async function generate(args: string[], env: Record<string, string> = declared) {
      const { failed, output } = await project.runOnce([CLI, 'generate', ...args], env);
      expect(failed, output).toBe(false);
      return output;
    }

    test('are written from the built app, which is not started', async () => {
      expect((await project.runOnce(BUILD)).failed).toBe(false);
      // The build left a client the app wrote before: none here, but nothing must depend on it.
      await rm(path.join(project.directory, 'generated'), { recursive: true, force: true });

      const output = await generate(['dist/app.module.js']);

      expect(output).toBe('Generated generated/root-client.ts\n');
      expect(startedIn(output)).toEqual([]);
      expect(urlsIn(await project.rootClient())).toEqual(['/a', '/b']);
    });

    test('are written whatever `generateClientsOnStart` says, and again when up to date', async () => {
      expect((await project.runOnce(BUILD)).failed).toBe(false);
      const off = { ...declared, ON_START: 'false' };

      expect(await generate(['dist/app.module.js'], off)).toContain('Generated');
      expect(await generate(['dist/app.module.js'], off)).toContain('Generated');
    });

    test.each([
      ['oxc', '@oxc-node/core/register'],
      ['SWC', '@swc-node/register/esm-register'],
    ])('are written from the source, under the %s loader `--import` names', async (_, loader) => {
      const output = await generate(['src/app.module.ts', '--import', loader]);

      expect(output).toContain('Generated generated/root-client.ts\n');
      expect(startedIn(output)).toEqual([]);
      expect(urlsIn(await project.rootClient())).toEqual(['/a', '/b']);
    });

    test('fails on a TypeScript file with no loader, in two lines that say what it needs', async () => {
      const { failed, output } = await project.runOnce(
        [CLI, 'generate', 'src/app.module.ts'],
        declared,
      );

      expect(failed).toBe(true);
      expect(output).toMatch(/^nestjs-endpoints: could not load src\/app\.module\.ts: /);
      expect(output).toContain('A TypeScript file needs a loader');
      expect(output.trim().split('\n')).toHaveLength(2);
      expect(await project.rootClient()).toBeUndefined();
    });

    // Node fails on it before the command's own code runs, so what it prints is Node's error,
    // not one of the command's: this pins only that it fails, names the module, and writes
    // nothing.
    test("fails on an `--import` Node cannot find, with Node's own error, which names it", async () => {
      const { failed, output } = await project.runOnce(
        [CLI, 'generate', 'src/app.module.ts', '--import', 'no-such-loader/register'],
        declared,
      );

      expect(failed).toBe(true);
      expect(output).toContain('no-such-loader');
      expect(await project.rootClient()).toBeUndefined();
    });

    test('fails for an app that declares no clients', async () => {
      expect((await project.runOnce(BUILD)).failed).toBe(false);

      const { failed, output } = await project.runOnce([CLI, 'generate', 'dist/app.module.js']);

      expect(failed).toBe(true);
      expect(output).toBe(
        "nestjs-endpoints: dist/app.module.js: the app's NestjsEndpoints.forRoot() declares no `clients`.\n",
      );
    });

    test('prints how it is used when it is given nothing to do', async () => {
      const { failed, output } = await project.runOnce([CLI]);

      expect(failed).toBe(true);
      expect(output).toMatch(/^Usage: nestjs-endpoints generate <module file>/);
    });
  });

  describe("with a script of the app's own", () => {
    test('are written with the global prefix it gives the app, and nothing is started', async () => {
      const script = path.join(project.directory, 'src/codegen.ts');
      await writeFile(script, codegenSource);
      try {
        expect((await project.runOnce(BUILD)).failed).toBe(false);

        const { failed, output } = await project.runOnce(['dist/codegen'], declared);

        // It ends by itself: one that stays up is stopped, and fails.
        expect(failed, output).toBe(false);
        expect(startedIn(output)).toEqual([]);
        expect(urlsIn(await project.rootClient())).toEqual(['/api/a', '/api/b']);
      } finally {
        await rm(script);
      }
    });
  });
});
