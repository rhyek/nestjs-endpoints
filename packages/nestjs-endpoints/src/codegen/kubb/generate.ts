import path from 'node:path';
import type { UserConfig } from 'kubb';
import type { EndpointDescriptor } from '../../descriptors.js';
import type { SharedSchemas } from '../../shared-schemas.js';
import { hashHeader } from '../hash.js';
import { adapterEndpoints, buildInputNode } from './adapter.js';
import { emitPlugin } from './emit-plugin.js';
import { buildSchemasModuleSource, collectInputSchemas } from './input-schemas.js';
import { kindOverrides } from './operation-kind.js';
import { AXIOS_CLIENT_RUNTIME_SOURCE, REACT_QUERY_CLIENT_RUNTIME_SOURCE } from './runtime.js';
import { buildAxiosWrapperSource, buildReactQueryWrapperSource } from './wrapper.js';

/**
 * Options forwarded to `@kubb/plugin-react-query` (the public `options` field on
 * a react-query client). `client` (which client plugin the hooks call) and
 * `hooks` (the wrapper binds the `use*` hooks, so they are always generated)
 * are managed by nestjs-endpoints and omitted.
 */
export type ReactQueryPluginOptions = OmitEach<
  NonNullable<Parameters<typeof import('@kubb/plugin-react-query').pluginReactQuery>[0]>,
  'client' | 'hooks'
>;

/** `Omit` applied to each member of a union (the plugin options are one). */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

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
  const [{ createKubb }, kit, { pluginTs }, { pluginClient }] = await Promise.all([
    import('kubb'),
    import('kubb/kit'),
    import('@kubb/plugin-ts'),
    import('@kubb/plugin-client'),
  ]);
  return { createKubb, kit, pluginTs, pluginClient };
}

type Kubb = Awaited<ReturnType<typeof loadKubb>>;

/**
 * Run one Kubb generation pass. `root` is the cwd (where the consumer's
 * `outputFile` lives, e.g. `process.cwd() + '/generated/...'`) so Kubb writes
 * the tree exactly at `outDir` with no duplicated, cwd-relative copy.
 */
async function runKubbBuild(
  kubb: Kubb,
  source: { descriptors: EndpointDescriptor[]; shared: SharedSchemas },
  outDir: string,
  plugins: NonNullable<UserConfig['plugins']>,
): Promise<void> {
  const { createKubb, kit, pluginTs, pluginClient } = kubb;
  const build = createKubb({
    root: process.cwd(),
    // Kubb requires an `input` beside an adapter; ours ignores it and reads
    // the descriptors.
    input: {},
    adapter: adapterEndpoints(kit, buildInputNode(source)),
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
  /** The client's descriptors, already filtered to its namespaces. */
  descriptors: EndpointDescriptor[];
  /** The shared schemas of the whole app. */
  shared: SharedSchemas;
  outputFile: string;
  /** Written into the wrapper's first line, for change detection. */
  hash: string;
}): Promise<void> {
  const { descriptors, shared, outputFile, hash } = params;
  const { outDir, dirName } = resolveLayout(outputFile);
  const kubb = await loadKubb();

  const wrapperSource = buildAxiosWrapperSource({
    descriptors,
    clientsImport: `./${dirName}/clients`,
    typesImport: `./${dirName}/types`,
    runtimeImport: `./${dirName}/client-runtime`,
  });

  await runKubbBuild(kubb, { descriptors, shared }, outDir, [
    emitPlugin(kubb.kit, {
      name: 'plugin-nestjs-endpoints-axios',
      outDir,
      outputFile,
      files: [
        {
          baseName: 'client-runtime.ts',
          source: AXIOS_CLIENT_RUNTIME_SOURCE,
        },
      ],
      wrapperSource: hashHeader(hash) + wrapperSource,
    }),
  ]);
}

/**
 * Generate the react-query client for one `setupCodegen` entry using Kubb.
 *
 * The hooks call the same request functions the axios methods expose, and
 * unwrap the response's data themselves. They read their bound client from
 * React context via `bindHook`. Each operation's input and query schemas go
 * into `schemas.ts` beside the runtime.
 */
export async function generateReactQueryClient(params: {
  /** The client's descriptors, already filtered to its namespaces. */
  descriptors: EndpointDescriptor[];
  /** The shared schemas of the whole app. */
  shared: SharedSchemas;
  outputFile: string;
  options?: ReactQueryPluginOptions;
  /** Written into the wrapper's first line, for change detection. */
  hash: string;
}): Promise<void> {
  const { descriptors, shared, outputFile, options, hash } = params;
  const { outDir, dirName } = resolveLayout(outputFile);
  const [kubb, { pluginReactQuery }] = await Promise.all([
    loadKubb(),
    import('@kubb/plugin-react-query'),
  ]);

  const inputSchemas = collectInputSchemas(descriptors, shared);
  const wrapperSource = buildReactQueryWrapperSource({
    descriptors,
    shared,
    opsImport: `./${dirName}/clients`,
    hooksImport: `./${dirName}/hooks`,
    runtimeImport: `./${dirName}/client-runtime`,
    typesImport: `./${dirName}/types`,
    schemasImport: `./${dirName}/schemas`,
    pluginOptions: options,
    inputSchemaNames: new Set(inputSchemas.keys()),
  });

  await runKubbBuild(kubb, { descriptors, shared }, outDir, [
    pluginReactQuery({
      ...options,
      // The builder, not the HTTP method, decides each operation's kind.
      override: kindOverrides(descriptors, options) as NonNullable<
        ReactQueryPluginOptions['override']
      >,
      hooks: true,
    }),
    emitPlugin(kubb.kit, {
      name: 'plugin-nestjs-endpoints-react-query',
      outDir,
      outputFile,
      files: [
        {
          baseName: 'client-runtime.ts',
          source: REACT_QUERY_CLIENT_RUNTIME_SOURCE,
        },
        {
          baseName: 'schemas.ts',
          source: buildSchemasModuleSource({
            entries: inputSchemas.values(),
            runtimeImport: './client-runtime',
            typesImport: './types',
          }),
        },
      ],
      wrapperSource: hashHeader(hash) + wrapperSource,
    }),
  ]);
}
