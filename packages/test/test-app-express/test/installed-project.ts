import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export const run = promisify(execFile);

const appDirectory = path.resolve(import.meta.dirname, '..');
const libraryDirectory = path.resolve(appDirectory, '../../nestjs-endpoints');

/**
 * A project as an app has after installing the package, for the specs that run one with plain
 * `node`: a copy of the built package in its `node_modules` (a link would resolve the package's
 * dependencies from the workspace, which has `@nestjs/swagger`), and links to the dependencies
 * the workspace installed. `@nestjs/swagger` is left out, linked, or a package that throws
 * when it is loaded. Resolves to the project's directory, which the spec removes.
 */
export async function createInstalledProject(
  prefix: string,
  swagger: 'absent' | 'installed' | 'broken' = 'absent',
): Promise<string> {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), prefix)));
  const modules = path.join(directory, 'node_modules');
  const link = async (name: string, from: string) => {
    await mkdir(path.dirname(path.join(modules, name)), { recursive: true });
    await symlink(await realpath(path.join(from, 'node_modules', name)), path.join(modules, name));
  };

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
    await link(name, libraryDirectory);
  }
  for (const name of [await platformPackage(), 'rxjs', 'typescript', '@types/node']) {
    await link(name, appDirectory);
  }

  if (swagger === 'installed') {
    await link('@nestjs/swagger', libraryDirectory);
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

/** The HTTP adapter this test app is built on: `@nestjs/platform-express`, or another. */
export async function platformPackage(): Promise<string> {
  const { dependencies } = JSON.parse(
    await readFile(path.join(appDirectory, 'package.json'), 'utf-8'),
  );
  return Object.keys(dependencies).find((name) => name.startsWith('@nestjs/platform-'))!;
}
