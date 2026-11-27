import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import type { LoggerService, Type } from '@nestjs/common';
// Not re-exported by `@nestjs/common`'s index.
import { MODULE_METADATA } from '@nestjs/common/constants.js';
import {
  ApplicationConfig,
  ModulesContainer,
  NestApplicationContext,
  NestFactory,
} from '@nestjs/core';
import { rootOf } from '../app-root';
import { isWithin } from '../path-within';
import { ClientOptions, generateClients, resolveClients } from './clients';

const USAGE = `Usage: nestjs-endpoints generate <module file> [--import <module>]...

Writes the clients an app declares in NestjsEndpoints.forRoot({ clients }), without starting it.

  <module file>      The file that exports the app's root module, as the app runs it:
                     dist/app.module.js after a build, or src/app.module.ts with a loader.
  --import <module>  A module Node imports first, as its own --import: a TypeScript loader.
  -h, --help         Prints this.
`;

/**
 * What the command line asks for; nothing when it is not a command this has; or, when Node could
 * not read it (an option it does not have, one missing its value), Node's message.
 */
function parse(
  args: string[],
): { file: string; imports: string[] } | 'help' | { unreadable: string } | undefined {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        import: { type: 'string', multiple: true },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    // An ERR_PARSE_ARGS_* error: the options are this file's own, so the arguments are wrong.
    return { unreadable: (error as Error).message };
  }
  const { values, positionals } = parsed;
  if (values.help) {
    return 'help';
  }
  const [command, file, ...rest] = positionals;
  return command === 'generate' && file && rest.length === 0
    ? { file, imports: values.import ?? [] }
    : undefined;
}

/** Where the command runs, and where it prints. */
export type CommandIo = {
  cwd: string;
  /** The command's own script: it runs again under `--import`. */
  bin: string;
  out: (line: string) => void;
  err: (line: string) => void;
};

/**
 * Runs `nestjs-endpoints` with `args`, what follows its name on the command line, and resolves
 * to its exit code. Whatever fails is printed to `err` once, as its message alone.
 */
export async function runCommand(args: string[], io: CommandIo): Promise<number> {
  const asked = parse(args);
  if (asked === 'help') {
    io.out(USAGE);
    return 0;
  }
  if (!asked || 'unreadable' in asked) {
    if (asked) {
      io.err(`nestjs-endpoints: ${asked.unreadable}`);
    }
    io.err(USAGE);
    return 1;
  }
  if (asked.imports.length > 0) {
    // Node resolves and runs `--import` itself, before anything else it loads: the command
    // runs again under it, with nothing left to import, and with the options Node ran it with.
    const { status, signal } = spawnSync(
      process.execPath,
      [
        ...process.execArgv,
        ...asked.imports.flatMap((module) => ['--import', module]),
        io.bin,
        'generate',
        asked.file,
      ],
      { cwd: io.cwd, stdio: 'inherit' },
    );
    // Ended by a signal, it ends as a shell reports one: 128 and the signal's number.
    return status ?? (signal ? 128 + os.constants.signals[signal] : 1);
  }
  try {
    const written = await generate(asked.file, io);
    for (const { outputFile } of written) {
      io.out(`Generated ${path.relative(io.cwd, outputFile)}`);
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The library's own errors begin with its name already.
    io.err(`nestjs-endpoints: ${message.replace(/^nestjs-endpoints: /, '')}`);
    const thrown = thrownByTheApp(error);
    if (thrown?.stack) {
      io.err(thrown.stack);
    }
    return 1;
  }
}

/** The library's own sources, as the command runs them: `src/` or `dist/`. */
const librarySources = path.resolve(import.meta.dirname, '..');

/**
 * The error, of `error` and those it was caused by, that the app's own code threw: one whose
 * stack begins in a file of the app, not in this library, a package or Node. Its stack is where
 * the app went wrong; anything else's is no use to the app.
 */
function thrownByTheApp(error: unknown): Error | undefined {
  for (let current = error; current instanceof Error; current = current.cause) {
    const file = firstFrameFile(current);
    if (file && !isWithin(file, librarySources) && !file.split(/[\\/]/).includes('node_modules')) {
      return current;
    }
  }
  return undefined;
}

/** The file the first frame of `error`'s stack is in, when it is a file. */
function firstFrameFile(error: Error): string | undefined {
  const frame = error.stack
    ?.split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('at '));
  if (!frame) {
    return undefined;
  }
  // `at fn (location)`, or `at location`. A path may hold spaces and parentheses itself, so the
  // location in parentheses is what follows the first ` (` that opens a file's.
  const text = frame.slice('at '.length);
  const candidates = text.endsWith(')')
    ? [...text.matchAll(/ \(/g)].map((match) => text.slice(match.index + 2, -1))
    : [text.replace(/^async /, '')];
  for (const location of candidates) {
    const file = fileOf(location.replace(/:\d+:\d+$/, ''));
    if (file) {
      return file;
    }
  }
  return undefined;
}

/**
 * The file a frame's location names, without its line and column: a `file:` URL or an absolute
 * path, POSIX or Windows. `node:internal/…`, `native` and `index 0` are no file.
 */
function fileOf(location: string): string | undefined {
  if (location.startsWith('file:')) {
    try {
      return fileURLToPath(location);
    } catch {
      return undefined;
    }
  }
  return path.posix.isAbsolute(location) || path.win32.isAbsolute(location) ? location : undefined;
}

/** Whether `value` is a class `@Module()` decorates: one that declares any part of a module. */
function isModule(value: unknown): value is Type {
  return (
    typeof value === 'function' &&
    Object.values(MODULE_METADATA).some((key) => Reflect.hasMetadata(key, value))
  );
}

/**
 * The app's root module among what `file` exports: its default export, else the one named
 * `AppModule`, else the only module there is.
 */
export function findRootModule(exports: Record<string, unknown>, file: string): Type {
  for (const preferred of [exports.default, exports.AppModule]) {
    if (isModule(preferred)) {
      return preferred;
    }
  }
  const modules = Object.entries(exports).filter(([, value]) => isModule(value));
  if (modules.length === 1) {
    return modules[0][1] as Type;
  }
  if (modules.length === 0) {
    throw new Error(`${file} exports no NestJS module.`);
  }
  const names = modules.map(([name]) => name).join(', ');
  throw new Error(
    `${file} exports several modules (${names}). Export the app's root module as the ` +
      'default, or as "AppModule".',
  );
}

/**
 * Whether `error`, thrown as a TypeScript file was imported, is Node failing to run TypeScript:
 * syntax its type stripping does not remove (an enum), syntax the JavaScript engine does not run
 * once it is stripped (a decorator), or, with stripping off, the extension. A loader runs all of
 * them. Anything else is the file's own error: a syntax error, one it throws, a missing module.
 */
export function nodeCannotRunTypeScript(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return (
    code === 'ERR_UNKNOWN_FILE_EXTENSION' ||
    code === 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX' ||
    // The engine's own syntax errors carry no code; every one Node throws does.
    (error instanceof SyntaxError && code === undefined)
  );
}

/**
 * What the app logs as the command makes it. Its warnings are lines of `err`, short of NestJS's
 * own that it is in preview mode, which the command asked for. Its errors are the command's
 * failure, which the command prints once.
 */
function appLogger(err: (line: string) => void): LoggerService {
  return {
    log() {},
    error() {},
    warn(message: unknown, ...params: unknown[]) {
      const context = params.at(-1);
      if (context !== NestApplicationContext.name) {
        err(`WARN ${typeof context === 'string' ? `[${context}] ` : ''}${String(message)}`);
      }
    },
  };
}

/**
 * What `nestjs-endpoints generate <file>` does: writes every client the app whose root module
 * `file` exports declares in `NestjsEndpoints.forRoot()`, whether or not it is up to date, and
 * resolves to those it wrote.
 *
 * The app is created in NestJS's preview mode, which builds its modules and makes none of
 * their providers or controllers: nothing of the app runs, and no lifecycle hook is called.
 */
async function generate(
  /** As it was given: relative to `cwd`, and as the app runs it. */
  file: string,
  { cwd, err }: Pick<CommandIo, 'cwd' | 'err'>,
): Promise<ClientOptions[]> {
  const resolved = path.resolve(cwd, file);
  if (!fs.existsSync(resolved)) {
    throw new Error(`${file} does not exist.`);
  }
  let exports: Record<string, unknown>;
  try {
    exports = (await import(pathToFileURL(resolved).href)) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `could not load ${file}: ${message}` +
        (/\.[mc]?ts$/.test(file) && nodeCannotRunTypeScript(error)
          ? '\nA TypeScript file needs a loader, such as --import @oxc-node/core/register, ' +
            'unless it is the file a build wrote.'
          : ''),
      { cause: error },
    );
  }
  const app = await NestFactory.createApplicationContext(findRootModule(exports, file), {
    preview: true,
    abortOnError: false,
    logger: appLogger(err),
  });
  const modules = app.get(ModulesContainer);
  const root = rootOf(modules);
  if (!root) {
    throw new Error(`${file}: the app has no NestjsEndpoints.forRoot({ clients }).`);
  }
  if (!root.clients) {
    throw new Error(`${file}: the app's NestjsEndpoints.forRoot() declares no \`clients\`.`);
  }
  return generateClients(
    { modules, config: app.get(ApplicationConfig) },
    await resolveClients(root.clients, 'NestjsEndpoints.forRoot()'),
    { force: true, by: 'nestjs-endpoints' },
  );
}
