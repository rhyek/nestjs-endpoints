import path from 'node:path';
import type { OpenAPIObject } from '@nestjs/swagger';
import type { UserConfig } from 'kubb';
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
 * a react-query client). `client` (which client plugin the hooks call) and
 * `hooks` (the wrapper binds the `use*` hooks, so they are always generated)
 * are managed by nestjs-endpoints and omitted.
 */
export type ReactQueryPluginOptions = OmitEach<
  NonNullable<
    Parameters<
      typeof import('@kubb/plugin-react-query').pluginReactQuery
    >[0]
  >,
  'client' | 'hooks'
>;

/** `Omit` applied to each member of a union (the plugin options are one). */
type OmitEach<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

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

/** Load Kubb and the plugins every client uses. */
async function loadKubb() {
  const [
    { createKubb },
    kit,
    { adapterOas },
    { pluginTs },
    { pluginClient },
  ] = await Promise.all([
    import('kubb'),
    import('kubb/kit'),
    import('@kubb/adapter-oas'),
    import('@kubb/plugin-ts'),
    import('@kubb/plugin-client'),
  ]);
  return { createKubb, kit, adapterOas, pluginTs, pluginClient };
}

type Kubb = Awaited<ReturnType<typeof loadKubb>>;

/**
 * Run one Kubb generation pass. `root` is the cwd (where the consumer's
 * `outputFile` lives, e.g. `process.cwd() + '/generated/...'`) so Kubb writes
 * the tree exactly at `outDir` with no duplicated, cwd-relative copy.
 */
async function runKubbBuild(
  kubb: Kubb,
  document: OpenAPIObject,
  outDir: string,
  plugins: NonNullable<UserConfig['plugins']>,
): Promise<void> {
  const { createKubb, adapterOas, pluginTs, pluginClient } = kubb;
  const build = createKubb({
    root: process.cwd(),
    // Kubb types a parsed spec as a plain record.
    input: document as unknown as Record<string, unknown>,
    // `int64` stays `number`, as JSON carries it.
    adapter: adapterOas({ integerType: 'number' }),
    output: {
      path: outDir,
      clean: true,
      // No root aggregate barrel — the wrapper imports the per-directory
      // barrels it needs (clients / hooks / types) directly.
      barrel: false,
      // Emit verbatim — no formatter/linter dependency, deterministic output.
      format: false,
      lint: false,
    },
    plugins: [
      pluginTs(),
      // The request functions, generated against our own runtime module.
      pluginClient({ importPath: '../client-runtime' }),
      ...plugins,
    ],
  });
  try {
    await build.build();
  } finally {
    // The app keeps running after codegen; release what the build holds.
    build.dispose();
  }
}

/** Generate the axios client for one `setupCodegen` entry using Kubb. */
export async function generateAxiosClient(params: {
  document: OpenAPIObject;
  outputFile: string;
}): Promise<void> {
  const { document, outputFile } = params;
  const { outDir, dirName } = resolveLayout(outputFile);
  const kubb = await loadKubb();

  const wrapperSource = buildAxiosWrapperSource({
    document,
    clientsImport: `./${dirName}/clients`,
    typesImport: `./${dirName}/types`,
    runtimeImport: `./${dirName}/client-runtime`,
  });

  await runKubbBuild(kubb, document, outDir, [
    emitPlugin(kubb.kit, {
      name: 'plugin-nestjs-endpoints-axios',
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
 * The hooks call the same request functions the axios methods expose, and
 * unwrap the response's data themselves. They read their bound client from
 * React context via `bindHook`.
 */
export async function generateReactQueryClient(params: {
  document: OpenAPIObject;
  outputFile: string;
  options?: ReactQueryPluginOptions;
}): Promise<void> {
  const { document, outputFile, options } = params;
  const { outDir, dirName } = resolveLayout(outputFile);
  const [kubb, { pluginReactQuery }] = await Promise.all([
    loadKubb(),
    import('@kubb/plugin-react-query'),
  ]);

  const wrapperSource = buildReactQueryWrapperSource({
    document,
    opsImport: `./${dirName}/clients`,
    hooksImport: `./${dirName}/hooks`,
    runtimeImport: `./${dirName}/client-runtime`,
    typesImport: `./${dirName}/types`,
    queryMethods: (options?.query && options.query.methods) || ['GET'],
  });

  await runKubbBuild(kubb, document, outDir, [
    pluginReactQuery({ ...options, hooks: true }),
    emitPlugin(kubb.kit, {
      name: 'plugin-nestjs-endpoints-react-query',
      outDir,
      outputFile,
      runtimeSource: REACT_QUERY_CLIENT_RUNTIME_SOURCE,
      wrapperSource,
    }),
  ]);
}
