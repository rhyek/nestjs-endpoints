import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Module } from '@nestjs/common';
import { shown, stripExtension } from '../routing-files';
import { findRootModule, nodeCannotRunTypeScript, runCommand } from './command';
import { hashHeader } from './hash';
import { generateAxiosClient, generateReactQueryClient } from './kubb/generate';

vi.mock('./kubb/generate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./kubb/generate')>()),
  generateAxiosClient: vi.fn(),
  generateReactQueryClient: vi.fn(),
}));

const fixtures = path.resolve(import.meta.dirname, '../../test/fixtures/command');

describe('findRootModule', () => {
  @Module({ imports: [] })
  class AppModule {}
  @Module({ providers: [] })
  class OtherModule {}
  class NotAModule {}

  test('takes the default export when it is a module', () => {
    expect(findRootModule({ default: OtherModule, AppModule }, 'app.ts')).toBe(OtherModule);
  });

  test('else takes the export named AppModule', () => {
    expect(findRootModule({ OtherModule, AppModule, default: NotAModule }, 'app.ts')).toBe(
      AppModule,
    );
  });

  test('else takes the only module the file exports', () => {
    expect(findRootModule({ NotAModule, OtherModule, name: 'x' }, 'app.ts')).toBe(OtherModule);
  });

  test('refuses to choose between two modules', () => {
    @Module({ imports: [] })
    class ApiModule {}
    expect(() => findRootModule({ ApiModule, OtherModule }, 'app.ts')).toThrow(
      'app.ts exports several modules (ApiModule, OtherModule). Export the app\'s root module as the default, or as "AppModule".',
    );
  });

  test('fails for a file that exports no module', () => {
    expect(() => findRootModule({ NotAModule }, 'app.ts')).toThrow(
      'app.ts exports no NestJS module.',
    );
  });
});

describe('nodeCannotRunTypeScript', () => {
  // As Node 26 throws them, importing a TypeScript file with no loader.
  const coded = (error: Error, code: string) => Object.assign(error, { code });

  test.each([
    ['a decorator', new SyntaxError('Invalid or unexpected token')],
    [
      'an enum',
      coded(
        new SyntaxError('TypeScript enum is not supported in strip-only mode'),
        'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX',
      ),
    ],
    [
      'type stripping turned off',
      coded(new TypeError('Unknown file extension ".ts"'), 'ERR_UNKNOWN_FILE_EXTENSION'),
    ],
  ])('is so for %s', (_, error) => {
    expect(nodeCannotRunTypeScript(error)).toBe(true);
  });

  test.each([
    [
      'a syntax error',
      coded(new SyntaxError('Expression expected'), 'ERR_INVALID_TYPESCRIPT_SYNTAX'),
    ],
    ['an error the file throws', new Error('no database URL')],
    [
      'a module it does not find',
      coded(new Error("Cannot find package 'x'"), 'ERR_MODULE_NOT_FOUND'),
    ],
    ['what is no Error', 'not an Error'],
  ])('is not so for %s', (_, error) => {
    expect(nodeCannotRunTypeScript(error)).toBe(false);
  });
});

describe('runCommand', () => {
  const ran = ((globalThis as { commandFixtureRan?: string[] }).commandFixtureRan ??= []);
  let out: string;
  let written: string[];

  /** Runs the command line in the fixtures' folder: its exit code, and what it printed. */
  async function cli(...args: string[]) {
    const lines = { out: [] as string[], err: [] as string[] };
    const code = await runCommand(args, {
      cwd: fixtures,
      bin: 'unused',
      out: (line) => lines.out.push(line),
      err: (line) => lines.err.push(line),
    });
    return { code, ...lines };
  }

  /** What the command prints for a failure: one line, and no more. */
  const failed = (line: string) => ({ code: 1, out: [], err: [`nestjs-endpoints: ${line}`] });

  beforeEach(() => {
    out = fs.mkdtempSync(path.join(os.tmpdir(), 'nestjs-endpoints-command-'));
    process.env.COMMAND_FIXTURE_OUT = out;
    ran.length = 0;
    written = [];
    // What a build writes: the wrapper with its hash, and the output directory.
    const build = async ({ outputFile, hash }: { outputFile: string; hash: string }) => {
      fs.mkdirSync(stripExtension(outputFile), { recursive: true });
      fs.writeFileSync(outputFile, hashHeader(hash) + 'export {};\n');
    };
    vi.mocked(generateAxiosClient).mockReset().mockImplementation(build);
    vi.mocked(generateReactQueryClient).mockReset().mockImplementation(build);
    // Nothing the app logs reaches the terminal but through the command.
    for (const stream of [process.stdout, process.stderr]) {
      vi.spyOn(stream, 'write').mockImplementation((chunk) => {
        written.push(String(chunk));
        return true;
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(out, { recursive: true, force: true });
    delete process.env.COMMAND_FIXTURE_OUT;
  });

  test('writes every client the app declares, and names each from the working directory', async () => {
    expect(await cli('generate', 'app.module.ts')).toEqual({
      code: 0,
      out: [
        `Generated ${path.relative(fixtures, path.join(out, 'client.ts'))}`,
        `Generated ${path.relative(fixtures, path.join(out, 'hooks.tsx'))}`,
      ],
      err: [],
    });
    const [[axios]] = vi.mocked(generateAxiosClient).mock.calls;
    expect(axios.descriptors.map((d) => d.path)).toEqual(['/ping']);
    expect(generateReactQueryClient).toHaveBeenCalledTimes(1);
    expect(written).toEqual([]);
  });

  test('writes them again when they are up to date', async () => {
    await cli('generate', 'app.module.ts');
    await cli('generate', 'app.module.ts');
    expect(generateAxiosClient).toHaveBeenCalledTimes(2);
  });

  const USAGE = expect.stringMatching(/^Usage: nestjs-endpoints generate <module file>/);

  test('makes no provider of the app, and runs none of its hooks', async () => {
    await cli('generate', 'app.module.ts');
    expect(ran).toEqual([]);
  });

  test("prints the app's warnings", async () => {
    const result = await cli('generate', 'empty-root.module.ts');
    expect(result.code).toBe(0);
    expect(result.err).toEqual([
      `WARN [nestjs-endpoints] No endpoint files found in ${shown(path.join(fixtures, 'missing'))}.`,
    ]);
    expect(written).toEqual([]);
  });

  test('fails for a file that is not there', async () => {
    expect(await cli('generate', 'missing.module.ts')).toEqual(
      failed('missing.module.ts does not exist.'),
    );
  });

  /**
   * What the command prints for an error the app's own code threw: its line, then that error's
   * stack, which begins where the app threw it.
   */
  const failedInTheApp = (line: string, thrown: string, at: string) => ({
    code: 1,
    out: [],
    err: [
      `nestjs-endpoints: ${line}`,
      expect.stringMatching(
        new RegExp(`^Error: ${thrown}\\n\\s+at .*${at.replace('.', '\\.')}:\\d+:\\d+`),
      ),
    ],
  });

  test('fails for a file that throws as it loads, with where it threw', async () => {
    expect(await cli('generate', 'throws.module.ts')).toEqual(
      failedInTheApp(
        'could not load throws.module.ts: no database URL',
        'no database URL',
        'command/throws.module.ts',
      ),
    );
  });

  test('fails for an app with no NestjsEndpoints.forRoot', async () => {
    expect(await cli('generate', 'no-root.module.ts')).toEqual(
      failed('no-root.module.ts: the app has no NestjsEndpoints.forRoot({ clients }).'),
    );
  });

  test('fails for an app whose forRoot declares no clients', async () => {
    expect(await cli('generate', 'no-clients.module.ts')).toEqual(
      failed("no-clients.module.ts: the app's NestjsEndpoints.forRoot() declares no `clients`."),
    );
  });

  describe("prints an error the app's own code threw with where it threw", () => {
    test('in the `clients` function', async () => {
      expect(await cli('generate', 'clients-throw.module.ts')).toEqual(
        failedInTheApp(
          'the `clients` of NestjsEndpoints.forRoot() threw: no such folder',
          'no such folder',
          'command/clients-throw.module.ts',
        ),
      );
    });

    test('in an endpoint file, as NestJS builds the app', async () => {
      expect(await cli('generate', 'scan-fails.module.ts')).toEqual(
        failedInTheApp('boom in bad.endpoint', 'boom in bad.endpoint', 'throws/bad.endpoint.ts'),
      );
      // NestJS logs it too, with its stack, unless it is kept from the terminal.
      expect(written).toEqual([]);
    });
  });

  describe('prints any other failure in one line', () => {
    test('of clients that cannot be generated', async () => {
      expect(await cli('generate', 'one-output.module.ts')).toEqual(
        failed('two clients have the "outputFile" "generated/client.ts".'),
      );
    });

    test('of an app whose router gives a router it lists none of a name that one expects', async () => {
      const { code, out, err } = await cli('generate', 'expects-unmet.module.ts');
      expect({ code, out }).toEqual({ code: 1, out: [] });
      // One line, with no stack: the library threw it, for what the app declares.
      expect(err).toHaveLength(1);
      expect(err[0]).toMatch(
        /^nestjs-endpoints: EndpointRouter\.create\(\) in .*expects-unmet\.module\.ts: `expects` names `db`, which .*expects-unmet\.module\.ts, the router that lists it in `routers`, does not give its endpoints\. Add `db` to the `context` of that router\.$/,
      );
    });

    test('of an app with two roots', async () => {
      expect(await cli('generate', 'two-roots.module.ts')).toEqual(
        failed(
          'NestjsEndpoints.forRoot() is called more than once. An app calls it once, in its root module.',
        ),
      );
    });

    // Thrown by a package the library depends on, by the library, or by Node: its stack is no use
    // to the app.
    test.each([
      ['a package', (file: string) => `build (${file}/node_modules/@kubb/core/dist/index.js:1:1)`],
      [
        'a package, in a file URL',
        (file: string) => `build (file://${file}/node_modules/x/i.js:1:1)`,
      ],
      ['a package, on Windows', () => 'build (C:\\app\\node_modules\\@kubb\\core\\index.js:1:1)'],
      ['the library', () => `generate (${path.resolve(import.meta.dirname, '../x.ts')}:1:1)`],
      ['Node', () => 'compileSourceTextModule (node:internal/modules/esm/utils:318:16)'],
      ['Node, with no function', () => 'node:internal/modules/esm/translators:89:18'],
      ['Node, in a function of its own', () => 'Array.map (native)'],
      ['Node, awaiting', () => 'async Promise.all (index 0)'],
    ])('of a build, failed by %s', async (_, frame) => {
      const failure = new Error('a plugin failed');
      failure.stack = `Error: a plugin failed\n    at ${frame(fixtures)}`;
      vi.mocked(generateAxiosClient).mockRejectedValue(failure);
      expect(await cli('generate', 'app.module.ts')).toEqual(
        failed(
          `failed to generate the axios client "${path.join(out, 'client.ts')}": a plugin failed`,
        ),
      );
    });
  });

  // Wherever the app is, and however its path is written.
  test.each([
    ['in a function, in a file URL', 'fn (file:///Users/me/app/src/app.js:1:2)'],
    ['in a function, at a path', 'fn (/Users/me/app/src/app.js:3:4)'],
    ['in a constructor', 'new Store (/Users/me/app/src/store.js:3:4)'],
    ['in an async function', 'async fn (/Users/me/app/src/app.js:3:4)'],
    ['in no function, at a path', '/Users/me/app/src/app.js:3:4'],
    ['in no function, in a file URL', 'file:///Users/me/app/src/app.js:3:4'],
    ['at a path with spaces and parentheses', 'fn (/Users/a b/(x)/app.js:3:4)'],
    ['in no function, at a path with spaces and parentheses', '/Users/a b/(x)/app.js:3:4'],
    ['on Windows, in a file URL', 'fn (file:///C:/x/app.js:1:2)'],
    ['on Windows, at a path', 'fn (C:\\x\\app.js:1:2)'],
    ['on Windows, in no function', 'C:\\x\\app.js:1:2'],
  ])('prints the stack of an error the app threw %s', async (_, frame) => {
    const failure = new Error('the app failed');
    failure.stack = `Error: the app failed\n    at ${frame}\n    at run (node:internal/x:1:1)`;
    vi.mocked(generateAxiosClient).mockRejectedValue(failure);
    expect(await cli('generate', 'app.module.ts')).toEqual({
      code: 1,
      out: [],
      err: [
        `nestjs-endpoints: failed to generate the axios client "${path.join(out, 'client.ts')}": the app failed`,
        failure.stack,
      ],
    });
  });

  describe('with --import, runs itself again under Node with it', () => {
    const imported = 'data:text/javascript,';
    let execArgv: string[];
    /** Runs the command with `--import`, its script the fixture that ends as `how` says. */
    async function rerun(how: string) {
      const code = await runCommand(['generate', how, '--import', imported], {
        cwd: fixtures,
        bin: path.join(fixtures, 'rerun.ts'),
        out: () => {},
        err: () => {},
      });
      const node = JSON.parse(fs.readFileSync(path.join(out, 'rerun.json'), 'utf8')) as {
        execArgv: string[];
        args: string[];
      };
      return { code, ...node };
    }

    beforeEach(() => {
      execArgv = process.execArgv;
    });
    afterEach(() => {
      process.execArgv = execArgv;
    });

    test('and ends with its exit code', async () => {
      process.execArgv = [];
      expect(await rerun('7')).toEqual({
        code: 7,
        execArgv: ['--import', imported],
        args: ['generate', '7'],
      });
      expect((await rerun('0')).code).toBe(0);
    });

    // As a shell gives a command a signal ended: 128 and the signal's number.
    test('and ends as the shell ends one a signal ended', async () => {
      expect((await rerun('SIGTERM')).code).toBe(128 + os.constants.signals.SIGTERM);
    });

    test("with Node's own options, as it was run itself", async () => {
      process.execArgv = ['--no-deprecation', '--conditions=fixture'];
      expect((await rerun('0')).execArgv).toEqual([
        '--no-deprecation',
        '--conditions=fixture',
        '--import',
        imported,
      ]);
    });
  });

  test.each([[['--help']], [['-h']], [['generate', 'app.module.ts', '--help']]])(
    'prints how it is used for %j, and succeeds',
    async (args) => {
      expect(await cli(...args)).toEqual({ code: 0, out: [USAGE], err: [] });
    },
  );

  test.each([[[]], [['build']], [['generate']], [['generate', 'a.ts', 'b.ts']]])(
    'prints how it is used for %j, and fails',
    async (args) => {
      expect(await cli(...args)).toEqual({ code: 1, out: [], err: [USAGE] });
    },
  );

  // Node's own message names what it could not read.
  test.each([
    [['generate', 'a.ts', '--watch'], "Unknown option '--watch'"],
    [['generate', 'a.ts', '--imprt', 'tsx'], "Unknown option '--imprt'"],
    [['generate', 'a.ts', '--import'], "Option '--import <value>' argument missing"],
    [['generate', 'a.ts', '--imprt', '-h'], "Unknown option '--imprt'"],
  ])(
    'for %j, prints what it could not read, then how it is used, and fails',
    async (args, what) => {
      expect(await cli(...args)).toEqual({
        code: 1,
        out: [],
        err: [
          expect.stringMatching(new RegExp(`^nestjs-endpoints: ${RegExp.escape(what)}`)),
          USAGE,
        ],
      });
    },
  );
});
