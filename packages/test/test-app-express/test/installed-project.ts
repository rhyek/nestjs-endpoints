import { execFile } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export const run = promisify(execFile);

const appDirectory = path.resolve(import.meta.dirname, '..');
const libraryDirectory = path.resolve(appDirectory, '../../nestjs-endpoints');

// Where the packages a project is given come from. Nothing is installed from the network.
const modulesOf = {
  /** This test app's packages. */
  app: path.join(appDirectory, 'node_modules'),
  /** The package's own dependencies. */
  library: path.join(libraryDirectory, 'node_modules'),
  /** The workspace's own, which every package in it shares. */
  workspace: path.resolve(appDirectory, '../../../node_modules'),
};

/** Links the folder `target` into the project at `directory`, as the package `name`. */
async function linkAs(directory: string, name: string, target: string): Promise<void> {
  const link = path.join(directory, 'node_modules', name);
  await mkdir(path.dirname(link), { recursive: true });
  await symlink(await realpath(target), link);
}

/** Links a package this test app (or the package, or the workspace) depends on into a project. */
export function linkPackage(
  directory: string,
  name: string,
  from: keyof typeof modulesOf = 'app',
): Promise<void> {
  return linkAs(directory, name, path.join(modulesOf[from], name));
}

/**
 * Installs a copy of a package this test app depends on into the project at `directory`, with
 * links to its dependencies. Unlike a link, a copy finds its peers in the project: pnpm gave
 * the package this test app's own, among them a TypeScript the project replaces.
 */
export async function copyPackage(directory: string, name: string) {
  const source = await realpath(path.join(modulesOf.app, name));
  await cp(source, path.join(directory, 'node_modules', name), { recursive: true });
  // pnpm installs a package's dependencies beside it.
  const beside = path.resolve(source, ...name.split('/').map(() => '..'));
  const { dependencies = {} } = JSON.parse(
    await readFile(path.join(source, 'package.json'), 'utf-8'),
  );
  for (const dependency of Object.keys(dependencies)) {
    await linkAs(directory, dependency, path.join(beside, dependency));
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
  await rm(path.join(directory, 'node_modules/typescript'), { recursive: true });
  await linkAs(directory, 'typescript', path.join(cli, '../../typescript'));
}

/**
 * A project as an app has after installing the package, which a spec runs with plain `node` or
 * makes a Nest project in: a copy of the built package in its `node_modules` (a link would
 * resolve the package's dependencies from the workspace, which has `@nestjs/swagger`), and
 * links to the dependencies the workspace installed. `@nestjs/swagger` is left out, linked, or
 * a package that throws when it is loaded. Resolves to the project's directory, which the spec
 * removes.
 */
export async function createInstalledProject(
  prefix: string,
  swagger: 'absent' | 'installed' | 'broken' = 'absent',
): Promise<string> {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), prefix)));
  const modules = path.join(directory, 'node_modules');

  const library = JSON.parse(await readFile(path.join(libraryDirectory, 'package.json'), 'utf-8'));
  const copy = path.join(modules, 'nestjs-endpoints');
  await mkdir(copy, { recursive: true });
  for (const entry of ['package.json', 'dist', 'assets']) {
    await cp(path.join(libraryDirectory, entry), path.join(copy, entry), { recursive: true });
  }
  // Its dependencies and its peers, but for the optional ones: `@nestjs/swagger` is below.
  const optional = [...Object.keys(library.peerDependenciesMeta), '@nestjs/swagger'];
  for (const name of [
    ...Object.keys(library.dependencies),
    ...Object.keys(library.peerDependencies).filter((peer) => !optional.includes(peer)),
  ]) {
    await linkPackage(directory, name, 'library');
  }
  for (const name of [await platformPackage(), 'rxjs', 'typescript', '@types/node']) {
    await linkPackage(directory, name);
  }

  if (swagger === 'installed') {
    await linkPackage(directory, '@nestjs/swagger', 'library');
  } else if (swagger === 'broken') {
    const broken = path.join(modules, '@nestjs/swagger');
    await mkdir(broken, { recursive: true });
    await writeFile(
      path.join(broken, 'package.json'),
      JSON.stringify({
        name: '@nestjs/swagger',
        version: '12.0.0',
        type: 'module',
        main: 'index.js',
      }),
    );
    await writeFile(path.join(broken, 'index.js'), "throw new Error('a broken install');\n");
  }

  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ type: 'module' }));
  return directory;
}

/** The files under `directory`, relative to it, sorted. */
export async function filesIn(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .sort();
}

/** The HTTP adapter this test app is built on: `@nestjs/platform-express`, or another. */
export async function platformPackage(): Promise<string> {
  const { dependencies } = JSON.parse(
    await readFile(path.join(appDirectory, 'package.json'), 'utf-8'),
  );
  return Object.keys(dependencies).find((name) => name.startsWith('@nestjs/platform-'))!;
}
