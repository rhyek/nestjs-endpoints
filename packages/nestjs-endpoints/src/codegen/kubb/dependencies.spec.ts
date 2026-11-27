import fs from 'node:fs';
import path from 'node:path';

// Kubb's packages depend on each other with open ranges (`^5.20.1`), and a release of one often
// needs the same release of the others. A project that installs nestjs-endpoints resolves those
// ranges on the day it installs, so a Kubb package this one does not pin itself arrives newer
// than the ones it does, and client generation fails. A package manager gives a range the
// version a dependency beside it already fixed: every Kubb package the generators load is
// therefore a dependency of this package, at one exact version.

const packageJson = path.resolve(import.meta.dirname, '../../../package.json');
const { dependencies } = JSON.parse(fs.readFileSync(packageJson, 'utf-8')) as {
  dependencies: Record<string, string>;
};

const isKubb = (name: string) => name.startsWith('@kubb/');

/** The `package.json` of the package `name` as the package in `directory` resolves it. */
function installed(name: string, directory: string): string {
  for (let dir = directory; ; dir = path.dirname(dir)) {
    const manifest = path.join(dir, 'node_modules', name, 'package.json');
    if (fs.existsSync(manifest)) {
      // Where the package really is: its own dependencies are beside it.
      return fs.realpathSync(manifest);
    }
    if (dir === path.dirname(dir)) {
      throw new Error(`${name} is not installed for ${directory}`);
    }
  }
}

/** The Kubb packages `from` (a `package.json`) depends on, each with where it is installed. */
function kubbDependenciesOf(from: string): { name: string; manifest: string }[] {
  const manifest = JSON.parse(fs.readFileSync(from, 'utf-8')) as {
    dependencies?: Record<string, string>;
  };
  return Object.keys(manifest.dependencies ?? {})
    .filter(isKubb)
    .map((name) => ({ name, manifest: installed(name, path.dirname(from)) }));
}

/** Every Kubb package installed for this one, whatever depends on it. */
function installedKubbPackages(): Map<string, string> {
  const found = new Map<string, string>();
  const visit = (from: string) => {
    for (const { name, manifest } of kubbDependenciesOf(from)) {
      if (!found.has(name)) {
        found.set(
          name,
          (JSON.parse(fs.readFileSync(manifest, 'utf-8')) as { version: string }).version,
        );
        visit(manifest);
      }
    }
  };
  visit(packageJson);
  return found;
}

test('every Kubb package the generators load is a dependency of the package, at the exact version installed', () => {
  const pinned = Object.fromEntries(Object.entries(dependencies).filter(([name]) => isKubb(name)));
  expect(pinned).toEqual(Object.fromEntries(installedKubbPackages()));
});
