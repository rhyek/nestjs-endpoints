import path from 'node:path';
import { createKubb, type UserConfig } from '@kubb/core';
import { ast, defineExtension, injectFile } from '@kubb/kit';
import { parserTs, parserTsx } from '@kubb/parser-ts';
import { pluginAxios } from '@kubb/plugin-axios';
import { pluginReactQuery } from '@kubb/plugin-react-query';
import { pluginTs } from '@kubb/plugin-ts';
import type { EndpointDescriptor } from '../../descriptors';
import { stripExtension } from '../../routing-files';
import type { SharedSchemas } from '../../shared-schemas';
import { hashHeader } from '../hash';
import { adapterEndpoints, buildInputNode } from './adapter';
import { buildSchemasModuleSource, collectInputSchemas } from './input-schemas';
import { kindOverrides } from './operation-kind';
import { buildAxiosWrapperSource, buildReactQueryWrapperSource } from './wrapper';

/**
 * Options forwarded to `@kubb/plugin-react-query` (the public `options` field on
 * a react-query client). nestjs-endpoints manages, and omits: `client` (which
 * client plugin the hooks call), `hooks` (the wrapper binds the `use*` hooks, so
 * they are always generated), and `output` and `group` (where the wrapper
 * imports the hooks from).
 */
export type ReactQueryPluginOptions = OmitEach<
  NonNullable<Parameters<typeof pluginReactQuery>[0]>,
  'client' | 'hooks' | 'output' | 'group'
>;

/** `Omit` applied to each member of a union (the plugin options are one). */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

// Each Kubb plugin writes one module, not a file per operation or schema: a client is a
// handful of files, and a contract change is a diff in the modules it touches.
const TYPES_FILE = 'types.ts';
const CLIENTS_FILE = 'clients.ts';
const HOOKS_FILE = 'hooks.ts';

/**
 * Inline Kubb plugin that emits our own artifacts as part of the same build:
 * the modules in `files` (into the output dir: for react-query, `schemas.ts`)
 * and the namespaced wrapper (at `outputFile`).
 * Nothing is written, post-processed, or deleted by us outside the pipeline —
 * `output.clean` prunes only Kubb's own output directory, and the wrapper at
 * `outputFile` is rewritten in full each run.
 */
function emitPlugin(params: {
  name: string;
  outDir: string;
  outputFile: string;
  /** Modules for the output dir, by file name. */
  files: { baseName: string; source: string }[];
  wrapperSource: string;
}) {
  const { name, outDir, outputFile, files, wrapperSource } = params;
  const { createSource, createText } = ast.factory;
  const raw = (baseName: string, filePath: string, value: string) =>
    injectFile({
      baseName: baseName as `${string}.${string}`,
      path: filePath,
      sources: [
        createSource({
          name: path.parse(baseName).name,
          nodes: [createText(value)],
          isExportable: true,
          isIndexable: false,
        }),
      ],
    });
  return defineExtension({
    kind: 'plugin',
    meta: { name },
    setup(options) {
      for (const { baseName, source } of files) {
        raw(baseName, path.join(outDir, baseName), source);
      }
      raw(path.basename(outputFile), outputFile, wrapperSource);
      return options;
    },
  })({});
}

/**
 * Run one Kubb generation pass into the directory beside `outputFile`
 * (`generated/axios-client/` for `generated/axios-client.ts`), with the
 * wrapper itself at `outputFile`. `root` is the cwd (where the consumer's
 * `outputFile` lives, e.g. `process.cwd() + '/generated/...'`) so Kubb writes
 * the tree exactly at the output directory with no duplicated, cwd-relative
 * copy.
 */
async function runKubbBuild(params: {
  name: string;
  source: { descriptors: EndpointDescriptor[]; shared: SharedSchemas };
  outputFile: string;
  /** Modules for the output dir besides Kubb's, by file name. */
  files: { baseName: string; source: string }[];
  wrapperSource: string;
  hash: string;
  plugins: NonNullable<UserConfig['plugins']>;
}): Promise<void> {
  const { name, source, outputFile, files, wrapperSource, hash, plugins } = params;
  const outDir = stripExtension(outputFile);
  const build = createKubb({
    root: process.cwd(),
    // Kubb requires an `input` beside an adapter; ours ignores it and reads
    // the descriptors.
    input: {},
    adapter: adapterEndpoints(buildInputNode(source)),
    // What prints the generated modules: the wrapper of a React Query client is a `.tsx`.
    parsers: [parserTs(), parserTsx()],
    output: {
      path: outDir,
      clean: true,
      // Emit verbatim — no formatter/linter dependency, deterministic output.
      format: false,
      lint: false,
    },
    plugins: [
      pluginTs({ output: { path: TYPES_FILE } }),
      // The request functions, and the axios runtime they call
      // (`.kubb/client.ts`), which the wrapper builds its clients from.
      pluginAxios({ output: { path: CLIENTS_FILE } }),
      ...plugins,
      emitPlugin({
        name,
        outDir,
        outputFile,
        files,
        wrapperSource: hashHeader(hash) + wrapperSource,
      }),
    ],
  });
  try {
    await build.build();
  } finally {
    // The app keeps running after codegen; release what the build holds.
    build.dispose();
  }
}

/** The directory name of the generated tree, as the wrapper imports it. */
function treeDir(outputFile: string): string {
  return `./${path.basename(stripExtension(outputFile))}`;
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
  const dir = treeDir(outputFile);
  await runKubbBuild({
    name: 'plugin-nestjs-endpoints-axios',
    source: { descriptors, shared },
    outputFile,
    files: [],
    wrapperSource: buildAxiosWrapperSource({
      descriptors,
      shared,
      clientsImport: `${dir}/clients`,
      typesImport: `${dir}/types`,
      runtimeImport: `${dir}/.kubb/client`,
    }),
    hash,
    plugins: [],
  });
}

/**
 * Generate the react-query client for one `setupCodegen` entry using Kubb.
 *
 * The hooks call the same request functions the client's methods expose, and
 * unwrap the response's data themselves. They read their client from React
 * context via `bindHook`. Each operation's input and query schemas go into
 * `schemas.ts` in the generated tree.
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
  const dir = treeDir(outputFile);
  const inputSchemas = collectInputSchemas(descriptors, shared);
  await runKubbBuild({
    name: 'plugin-nestjs-endpoints-react-query',
    source: { descriptors, shared },
    outputFile,
    files: [
      {
        baseName: 'schemas.ts',
        source: buildSchemasModuleSource({
          entries: inputSchemas.values(),
          typesImport: './types',
        }),
      },
    ],
    wrapperSource: buildReactQueryWrapperSource({
      descriptors,
      shared,
      opsImport: `${dir}/clients`,
      hooksImport: `${dir}/hooks`,
      runtimeImport: `${dir}/.kubb/client`,
      typesImport: `${dir}/types`,
      schemasImport: `${dir}/schemas`,
      pluginOptions: options,
      inputSchemaNames: new Set(inputSchemas.keys()),
    }),
    hash,
    plugins: [
      pluginReactQuery({
        ...options,
        output: { path: HOOKS_FILE },
        // The builder, not the HTTP method, decides each operation's kind.
        override: kindOverrides(descriptors, options) as NonNullable<
          ReactQueryPluginOptions['override']
        >,
        hooks: true,
      }),
    ],
  });
}
