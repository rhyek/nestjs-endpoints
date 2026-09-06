import path from 'node:path';
import type { UserConfig } from '@kubb/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { emitPlugin } from './emit-plugin.js';
import {
  AXIOS_CLIENT_RUNTIME_SOURCE,
  REACT_QUERY_CLIENT_RUNTIME_SOURCE,
} from './runtime.js';
import {
  buildAxiosWrapperSource,
  buildReactQueryWrapperSource,
} from './wrapper.js';

/**
 * Options forwarded to `@kubb/plugin-react-query` (the public `options` field on
 * a react-query client) — `client` is omitted because nestjs-endpoints manages
 * the HTTP client wiring (`importPath` / `dataReturnType`).
 */
export type ReactQueryPluginOptions = Omit<
  NonNullable<
    Parameters<
      typeof import('@kubb/plugin-react-query').pluginReactQuery
    >[0]
  >,
  'client'
>;

/**
 * The sibling directory that holds the Kubb-generated tree + runtime for a
 * client. The consumer-facing entry lives at `outputFile`
 * (`generated/axios-client.ts`); this is the folder beside it
 * (`generated/axios-client/`). Single source of truth, shared with
 * `setupCodegen`'s cleanup + existence checks so they can't drift.
 */
export function outputDirFor(outputFile: string): string {
  const ext = path.extname(outputFile);
  return ext ? outputFile.slice(0, -ext.length) : outputFile;
}

function resolveLayout(outputFile: string) {
  const outDir = outputDirFor(outputFile);
  return { outDir, dirName: path.basename(outDir) };
}

type KubbCore = typeof import('@kubb/core');

/**
 * Run one Kubb generation pass. `root` is the cwd (where the consumer's
 * `outputFile` lives, e.g. `process.cwd() + '/generated/...'`) so Kubb writes
 * the tree exactly at `outDir` with no duplicated, cwd-relative copy.
 */
async function runKubbBuild(
  build: KubbCore['build'],
  document: OpenAPIObject,
  outDir: string,
  plugins: UserConfig['plugins'],
): Promise<void> {
  await build({
    config: {
      root: process.cwd(),
      input: { data: document },
      output: {
        path: outDir,
        clean: true,
        extension: { '.ts': '' },
        // No root aggregate barrel — the wrapper imports the per-directory
        // barrels it needs (clients / axios-clients / hooks / types) directly,
        // and a root barrel would collide when the react-query output carries
        // two client sets (`clients` + `axios-clients`) sharing operation names.
        barrelType: false,
        // Emit verbatim — no formatter/linter dependency, deterministic output.
        format: false,
        lint: false,
      },
      plugins,
    },
  });
}

/** Generate the axios client for one `setupCodegen` entry using Kubb. */
export async function generateAxiosClient(params: {
  document: OpenAPIObject;
  outputFile: string;
}): Promise<void> {
  const { document, outputFile } = params;
  const { outDir, dirName } = resolveLayout(outputFile);

  const [
    { build, definePlugin },
    { pluginOas },
    { pluginTs },
    { pluginClient },
  ] = await Promise.all([
    import('@kubb/core'),
    import('@kubb/plugin-oas'),
    import('@kubb/plugin-ts'),
    import('@kubb/plugin-client'),
  ]);

  const wrapperSource = buildAxiosWrapperSource({
    document,
    clientsImport: `./${dirName}/clients`,
    typesImport: `./${dirName}/types`,
    runtimeImport: `./${dirName}/client-runtime`,
  });

  await runKubbBuild(build, document, outDir, [
    pluginOas({ generators: [] }),
    pluginTs(),
    pluginClient({
      clientType: 'function',
      dataReturnType: 'full',
      importPath: '../client-runtime',
    }),
    emitPlugin(definePlugin, {
      name: 'nestjs-endpoints-axios',
      outDir,
      outputFile,
      runtimeSource: AXIOS_CLIENT_RUNTIME_SOURCE,
      wrapperSource,
    }),
  ]);
}

/**
 * Generate the react-query client for one `setupCodegen` entry using Kubb.
 *
 * Two `plugin-client` instances run in one pass: a `data` client (at `clients`,
 * consumed by the hooks so they return unwrapped data) and a `full` client (at
 * `axios-clients`, consumed by the wrapper's imperative axios methods so they
 * match the standalone axios client's `AxiosResponse`). The hooks read their
 * bound client from React context via `bindHook`.
 */
export async function generateReactQueryClient(params: {
  document: OpenAPIObject;
  outputFile: string;
  options?: ReactQueryPluginOptions;
}): Promise<void> {
  const { document, outputFile, options } = params;
  const { outDir, dirName } = resolveLayout(outputFile);

  const [
    { build, definePlugin },
    { pluginOas },
    { pluginTs },
    { pluginClient },
    { pluginReactQuery },
  ] = await Promise.all([
    import('@kubb/core'),
    import('@kubb/plugin-oas'),
    import('@kubb/plugin-ts'),
    import('@kubb/plugin-client'),
    import('@kubb/plugin-react-query'),
  ]);

  const wrapperSource = buildReactQueryWrapperSource({
    document,
    opsImport: `./${dirName}/axios-clients`,
    hooksImport: `./${dirName}/hooks`,
    runtimeImport: `./${dirName}/client-runtime`,
    typesImport: `./${dirName}/types`,
  });

  await runKubbBuild(build, document, outDir, [
    pluginOas({ generators: [] }),
    pluginTs(),
    // `data` client (at `clients`) — the hooks import from here.
    pluginClient({
      clientType: 'function',
      dataReturnType: 'data',
      importPath: '../client-runtime',
      output: { path: 'clients' },
    }),
    // `full` client (at `axios-clients`) — the wrapper's axios methods.
    pluginClient({
      clientType: 'function',
      dataReturnType: 'full',
      importPath: '../client-runtime',
      output: { path: 'axios-clients' },
    }),
    pluginReactQuery({
      ...options,
      client: { importPath: '../client-runtime', dataReturnType: 'data' },
    }),
    emitPlugin(definePlugin, {
      name: 'nestjs-endpoints-react-query',
      outDir,
      outputFile,
      runtimeSource: REACT_QUERY_CLIENT_RUNTIME_SOURCE,
      wrapperSource,
    }),
  ]);
}
