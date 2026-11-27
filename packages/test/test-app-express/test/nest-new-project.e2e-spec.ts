import { mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { linkPackage, linkTypescriptWithApi } from './installed-project';
import { adapterSource, createNestProject, NEST, NestProject, SETUP_TIMEOUT } from './nest-project';

// The scripts of the project `nest new` makes, run on that project once nestjs-endpoints was
// added to it. `start` and `start:dev` have a spec of their own, `routing-nest-cli`; these are
// the others: `build` and `start:prod`, `test:e2e`, `lint`. Then what the package asks of the
// project's root module.

// What each script runs, as `node` arguments from the project's directory.
const BUILD = [NEST, 'build'];
const START = [NEST, 'start'];
const START_PROD = ['dist/main'];
const TEST_E2E = ['node_modules/vitest/vitest.mjs', 'run', '--config', './vitest.config.e2e.ts'];
const LINT = ['node_modules/oxlint/bin/oxlint', '--type-aware', 'src/', 'test/'];

// A test as the project's own `test/app.e2e-spec.ts` is written, but for the adapter, which is
// this test app's, and the requests, made with `fetch` so that they read the same on all of
// them. It replaces a provider the endpoints depend on: that only takes effect if the endpoint
// files got the same `Clock` class this spec imported.
const endpointSpecSource = `import { Test } from '@nestjs/testing';
import { AppModule } from './../src/app.module.js';
import { Clock } from './../src/health.service.js';
${adapterSource}

describe('the endpoints (e2e)', () => {
  test('answers on every endpoint file, with the provider the spec replaced', async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue({ now: () => 0 })
      .compile();
    const app = moduleFixture.createNestApplication(new Adapter());
    await app.listen(0, '127.0.0.1');
    try {
      for (const route of ['a', 'b']) {
        const response = await fetch((await app.getUrl()) + '/' + route);
        // The health service reports a clock at zero as not ok.
        expect(await response.json()).toEqual({ ok: false });
      }
    } finally {
      await app.close();
    }
  });
});
`;

// What the Testing guide has a project add to each of its Vitest configs.
const INLINE = "server: { deps: { inline: ['nestjs-endpoints'] } },";

describe('a project made by `nest new`, with nestjs-endpoints added', { timeout: 120_000 }, () => {
  let project: NestProject;

  const inProject = (file: string) => path.join(project.directory, file);
  const read = (file: string) => readFile(inProject(file), 'utf-8');
  const json = async (file: string) => JSON.parse(await read(file));

  /** Runs a script's command, and fails with what it printed if it did. */
  async function script(args: string[], env: Record<string, string> = {}) {
    const { failed, output } = await project.runOnce(args, env);
    expect(failed, output).toBe(false);
    return output;
  }

  beforeAll(async () => {
    project = await createNestProject('nest-new-');
    await linkTypescriptWithApi(project.directory);
    for (const name of ['oxlint', 'oxlint-tsgolint']) {
      await linkPackage(project.directory, name, 'workspace');
    }
    // oxlint looks for its type-aware half where a package manager links a package's commands.
    await mkdir(inProject('node_modules/.bin'), { recursive: true });
    await symlink(
      await realpath(inProject('node_modules/oxlint-tsgolint/bin/tsgolint.js')),
      inProject('node_modules/.bin/tsgolint'),
    );
    // The project's own test asks for Nest's default adapter, which only one test app has.
    await rm(inProject('test/app.e2e-spec.ts'));
    await writeFile(inProject('test/endpoints.e2e-spec.ts'), endpointSpecSource);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await project?.remove();
  });

  test('has the scripts these specs run', async () => {
    expect((await json('package.json')).scripts).toMatchObject({
      build: 'nest build',
      start: 'nest start',
      'start:dev': 'nest start --watch',
      'start:prod': 'node dist/main',
      'test:e2e': 'vitest run --config ./vitest.config.e2e.ts',
      lint: 'oxlint --type-aware src/ test/',
      format: 'prettier --write "src/**/*.ts" "test/**/*.ts"',
    });
    expect(await json('package.json')).toMatchObject({ type: 'module' });
    expect((await json('nest-cli.json')).compilerOptions).toEqual({ deleteOutDir: true });
  });

  test('installing the package into a git checkout writes the agent files, and leaves the project as Nest made it', async () => {
    await mkdir(inProject('.git'));
    try {
      const before = await project.files();

      await project.postinstall();

      expect(await project.files()).toEqual(
        [
          ...before,
          '.claude/rules/nestjs-endpoints.md',
          '.claude/skills/nestjs-endpoints/SKILL.md',
          '.claude/skills/nestjs-endpoints-refactor/SKILL.md',
        ].sort(),
      );
      expect(await read('.claude/rules/nestjs-endpoints.md')).toContain(
        `require.resolve('nestjs-endpoints/docs/llms.txt')`,
      );
      expect(await read('.gitattributes')).toBe('* text=auto eol=lf\n');
    } finally {
      await rm(inProject('.git'), { recursive: true });
      await rm(inProject('.claude'), { recursive: true, force: true });
    }
  });

  describe('`build`, then `start:prod`', () => {
    // As Nest's script has it, and as a deployment that sets the variable has it.
    const environments: [string, Record<string, string>][] = [
      ['with no NODE_ENV', {}],
      ['with NODE_ENV=production', { NODE_ENV: 'production' }],
    ];

    /** Runs `start:prod` where only `dist` was deployed. */
    async function startWithoutSource(env: Record<string, string>) {
      await rename(inProject('src'), inProject('src.away'));
      try {
        return await project.runOnce(START_PROD, env);
      } finally {
        await rename(inProject('src.away'), inProject('src'));
      }
    }

    beforeEach(async () => {
      await project.endpoints('a', 'b');
    });

    test.each(environments)('serves the endpoints, and has nothing to say (%s)', async (_, env) => {
      await script(BUILD);
      const before = await project.files();

      const { served, output } = await project.runOnce(START_PROD, env);

      expect(served, output).toEqual(['a', 'b']);
      expect(output).not.toMatch(/nestjs-endpoints/);
      expect(await project.files()).toEqual(before);
    });

    test.each(environments)('serves them where only `dist` was deployed (%s)', async (_, env) => {
      await script(BUILD);

      const { served, output } = await startWithoutSource(env);

      expect(served, output).toEqual(['a', 'b']);
      expect(output).not.toMatch(/nestjs-endpoints/);
    });

    test('serves what was built after an endpoint file was added and another deleted', async () => {
      await script(BUILD);
      await project.addEndpoint('c');
      await rm(project.endpointFile('a'));
      await script(BUILD);

      expect((await project.runOnce(START_PROD)).served).toEqual(['b', 'c']);
      expect((await startWithoutSource({})).served).toEqual(['b', 'c']);
    });
  });

  describe('`test:e2e`', () => {
    let config: string;

    beforeAll(async () => {
      config = await read('vitest.config.e2e.ts');
    });

    afterEach(async () => {
      await writeFile(inProject('vitest.config.e2e.ts'), config);
    });

    test('passes once its Vitest config has Vitest process the package', async () => {
      await project.endpoints('a', 'b');
      expect(config).toContain('globals: true,');
      await writeFile(
        inProject('vitest.config.e2e.ts'),
        config.replace('globals: true,', `globals: true,\n    ${INLINE}`),
      );

      const output = await script(TEST_E2E);

      expect(output).toMatch(/1 passed/);
    });

    test('fails with what to add to the Vitest config, as Nest wrote it', async () => {
      await project.endpoints('a', 'b');

      const { failed, output } = await project.runOnce(TEST_E2E);

      expect(failed).toBe(true);
      expect(output).toContain(
        'nestjs-endpoints: Vitest must process this package to load endpoint files. Add it to "server.deps.inline" in your Vitest config:',
      );
      expect(output).toContain("test: { server: { deps: { inline: ['nestjs-endpoints'] } } }");
    });
  });

  describe('`lint`', () => {
    test('passes', async () => {
      await project.endpoints('a', 'b');

      const output = await script(LINT);

      // Nothing it found: at most its summary, which it prints on some systems (Linux) and not
      // on others (macOS).
      const summary = /^Found 0 warnings and 0 errors\.\n|^Finished in .*\n/gm;
      expect(output.replace(summary, '').trim()).toBe('');
    });
  });

  describe('its root module', () => {
    let appModule: string;

    const router = (folder: string) =>
      `EndpointRouter.create({ rootDirectory: './${folder}', providers: [Clock, HealthService] })`;

    /** Replaces the app module's `imports` with `imports`, written as source. */
    async function withImports(imports: string) {
      const start = appModule.indexOf('imports: [');
      const end = appModule.indexOf('controllers:');
      await writeFile(
        project.appModule,
        appModule
          .replace(
            "import { NestjsEndpoints } from 'nestjs-endpoints';",
            "import { EndpointRouter, NestjsEndpoints } from 'nestjs-endpoints';",
          )
          .replace(appModule.slice(start, end), `imports: [${imports}],\n  `),
      );
    }

    beforeAll(async () => {
      appModule = await readFile(project.appModule, 'utf-8');
    });

    beforeEach(async () => {
      await project.endpoints('a', 'b');
    });

    afterEach(async () => {
      await writeFile(project.appModule, appModule);
    });

    test('with one router and no `NestjsEndpoints.forRoot`, starts: the router is its root', async () => {
      await withImports(router('endpoints'));

      const { served, output } = await project.runOnce(START);

      expect(served, output).toEqual(['a', 'b']);
    });

    test('with two routers and no `NestjsEndpoints.forRoot`, fails to start and asks for it', async () => {
      await withImports(`${router('endpoints')}, ${router('more')}`);

      const { failed, served, output } = await project.runOnce(START);

      expect(failed).toBe(true);
      expect(served).toBeUndefined();
      expect(output).toContain(
        'nestjs-endpoints: this app has 2 routers and no root. Add NestjsEndpoints.forRoot({ router: { … } }) to its root module; further routers stay as EndpointRouter.create().',
      );
    });

    test('with `NestjsEndpoints.forRoot` and routers beside it, starts', async () => {
      await withImports(`NestjsEndpoints.forRoot(), ${router('endpoints')}, ${router('more')}`);

      const { served, output } = await project.runOnce(START);

      expect(served, output).toEqual(['a', 'b']);
    });

    test('with `NestjsEndpoints.forRoot` twice, fails to start', async () => {
      await withImports(`NestjsEndpoints.forRoot(), NestjsEndpoints.forRoot()`);

      const { failed, output } = await project.runOnce(START);

      expect(failed).toBe(true);
      expect(output).toContain(
        'nestjs-endpoints: NestjsEndpoints.forRoot() is called more than once. An app calls it once, in its root module.',
      );
    });
  });
});
