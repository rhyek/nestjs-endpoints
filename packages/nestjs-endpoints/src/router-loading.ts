// What a router loads as it runs: the endpoint and router files it finds, and the endpoints
// its `endpoints` option lists.

import { pathToFileURL } from 'node:url';
import type { Type } from '@nestjs/common';
import { shown } from './routing-files';

/**
 * What a router's `endpoints` callback lists: an endpoint class, a promise
 * of one, or a promise of a module, as `import()` of a file resolves to,
 * which lists every endpoint the module exports.
 */
export type ListedEndpoint = Type | Promise<object>;

/** Whether `value` is what `endpoint.query()` and `endpoint.mutation()` return. */
export function isEndpoint(value: unknown): value is Type {
  return typeof value === 'function' && Reflect.hasMetadata('endpoints:setupFn', value);
}

/**
 * Vitest runs an installed package in plain Node unless the project inlines
 * it, and this package's `import()` of an endpoint file would then skip Vite:
 * a TypeScript file the app's own imports cannot find, or a second copy of
 * every class it imports.
 *
 * Two facts tell that case. Vite gives the modules it processes an
 * `import.meta.env`, and Node gives none. And a Vitest worker has both the
 * `VITEST` variable and Vitest's worker state; a process a test started (an
 * app run with `nest start` from a spec) inherits the variable but has no
 * worker state, and is left alone.
 */
function assertVitestProcessesThisPackage(): void {
  const inVitestWorker = Boolean(process.env.VITEST) && '__vitest_worker__' in globalThis;
  if (inVitestWorker && (import.meta as { env?: unknown }).env === undefined) {
    throw new Error(
      'nestjs-endpoints: Vitest must process this package to load endpoint files. ' +
        'Add it to "server.deps.inline" in your Vitest config:\n\n' +
        "  test: { server: { deps: { inline: ['nestjs-endpoints'] } } }",
    );
  }
}

/** What an endpoint or router file a router found exports. */
export async function importFile(file: string): Promise<{ default?: unknown }> {
  assertVitestProcessesThisPackage();
  return (await import(pathToFileURL(file).href)) as { default?: unknown };
}

/**
 * A file with a router file's name, imported to see whether it exports a router. It may be
 * any file of that name, so an error it throws says why the router loaded it.
 */
export async function importRouterFile(
  file: string,
  routerFile: string,
): Promise<{ default?: unknown }> {
  // Its own error, which no file caused.
  assertVitestProcessesThisPackage();
  try {
    return await importFile(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${shown(routerFile)} loaded ${shown(file)}, which has the name of a router file, to see ` +
        `whether it is one, and it threw: ${message}`,
      { cause: error },
    );
  }
}

/** The endpoints an entry of a router's `endpoints` gives. `at` begins its errors. */
export async function resolveListedEndpoints(listed: ListedEndpoint, at: string): Promise<Type[]> {
  const resolved = await listed;
  if (isEndpoint(resolved)) {
    return [resolved];
  }
  if (typeof resolved !== 'object' || resolved === null) {
    const name = (resolved as { name?: string } | undefined)?.name || String(resolved);
    throw new Error(
      `${at}: \`endpoints\` lists ${name}, which is not ` +
        'an endpoint. An endpoint is made with endpoint.query() or endpoint.mutation().',
    );
  }
  // A module: its exports that are endpoints, default or named.
  const exported = Object.values(resolved).filter(isEndpoint);
  if (exported.length === 0) {
    throw new Error(`${at}: \`endpoints\` lists a module that exports no endpoint.`);
  }
  return exported;
}
