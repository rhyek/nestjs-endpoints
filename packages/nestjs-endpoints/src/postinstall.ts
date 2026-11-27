import fs from 'node:fs';
import path from 'node:path';
import { syncAgentFiles } from './agent-files';
import { readOwnVersion } from './package-json';
import { isWithin } from './path-within';

/**
 * The package's `postinstall`: writes the coding-agent files (`agent-files.ts`) into the repo
 * that installed it, and keeps them current on every install after.
 *
 * It writes only into a git checkout, for the project the install ran in: `INIT_CWD` (set by
 * npm, pnpm and yarn to the directory the install was run in) must be in one, and the installed
 * package must be under that directory's `node_modules`. That rules out a deployment's install
 * (no checkout), a global install, and the package's own workspace. It is skipped in CI, where a
 * write would only dirty the checkout, and when `NESTJS_ENDPOINTS_SKIP_AGENT_FILES` is set.
 * Never throws: a failed postinstall fails the install itself.
 */
export function runPostinstall(opts: {
  /** The installed package's directory, the one holding its `package.json`. */
  packageDir: string;
  env: Record<string, string | undefined>;
  version: string;
  /** Where to report, a line at most; stderr by default. */
  write?: (line: string) => void;
}): void {
  const write = opts.write ?? ((line) => process.stderr.write(`${line}\n`));
  const { env } = opts;
  try {
    if (!env.INIT_CWD || isCI(env) || env.NESTJS_ENDPOINTS_SKIP_AGENT_FILES) {
      return;
    }
    const project = fs.realpathSync(env.INIT_CWD);
    const installed = fs.realpathSync(opts.packageDir);
    if (
      !isWithin(installed, project) ||
      !path.relative(project, installed).split(path.sep).includes('node_modules')
    ) {
      return;
    }
    const root = checkoutOf(project);
    if (!root) {
      return;
    }
    const changed = syncAgentFiles({ root, installed, version: opts.version });
    if (changed.length > 0) {
      const files = changed.map((file) => path.relative(root, file)).join(', ');
      write(`nestjs-endpoints: updated the coding-agent files: ${files}`);
    }
  } catch (err) {
    write(
      `nestjs-endpoints: could not write the coding-agent files (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

/** `CI` set to anything but `false` or `0`, as CI providers set it. */
function isCI(env: Record<string, string | undefined>): boolean {
  const ci = env.CI?.trim().toLowerCase();
  return ci !== undefined && ci !== '' && ci !== 'false' && ci !== '0';
}

/** The root of the git checkout `dir` is in (the directory holding `.git`), or `null`. */
function checkoutOf(dir: string): string | null {
  for (let current = dir; ; current = path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    if (path.dirname(current) === current) {
      return null;
    }
  }
}

/** The package's `postinstall` entry, called by `postinstall.js` at the package's root. */
export function main(): void {
  runPostinstall({
    packageDir: path.resolve(import.meta.dirname, '..'),
    env: process.env,
    version: readOwnVersion(),
  });
}
