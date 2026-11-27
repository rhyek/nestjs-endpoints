import fs from 'node:fs/promises';
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
const CONTEXT_FILE = 'context.ts';

/** A module of the output dir: its source, or the template it is a copy of. */
type ModuleFile = { baseName: string } & ({ source: string } | { copy: string });

/** A template of the package's, `assets/templates/<name>`: the same from `src/` and `dist/`. */
const template = (name: string) =>
  path.resolve(import.meta.dirname, '../../../assets/templates', name);

/**
 * Inline Kubb plugin that emits our own artifacts as part of the same build:
 * the modules in `files` (into the output dir: for react-query, `schemas.ts`
 * and `context.ts`, a copy of the package's template, whose imports Kubb's
 * parser prints again) and the namespaced wrapper (at `outputFile`). Nothing is
 * written by us outside the pipeline: after it, only what it did not write is
 * removed (`removeOthers`).
 */
function emitPlugin(params: {
  name: string;
  outDir: string;
  outputFile: string;
  /** Modules for the output dir, by file name. */
  files: ModuleFile[];
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
      for (const file of files) {
        if ('copy' in file) {
          injectFile({
            baseName: file.baseName as `${string}.${string}`,
            path: path.join(outDir, file.baseName),
            copy: file.copy,
          });
        } else {
          raw(file.baseName, path.join(outDir, file.baseName), file.source);
        }
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
  files: ModuleFile[];
  /** Files a plugin writes when they are missing, and leaves to the user after that. */
  userFiles?: string[];
  wrapperSource: string;
  hash: string;
  plugins: NonNullable<UserConfig['plugins']>;
}): Promise<void> {
  const { name, source, outputFile, files, userFiles = [], wrapperSource, hash, plugins } = params;
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
      // Kubb writes a file only when its content changed, unless it emptied the folder first:
      // a module that stays the same is then left alone, for whatever watches the folder. The
      // files a build no longer writes are removed below.
      clean: false,
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
  // The build releases what it holds once it has run, whether it failed or not: the app keeps
  // running after it.
  const { files: written } = await build.build();
  await removeOthers(
    outDir,
    new Set([...written.map((file) => file.path), ...userFiles].map((file) => path.resolve(file))),
  );
}

/**
 * Removes the files under `directory` that are not among `kept`, which are absolute paths: what
 * an earlier build left.
 */
async function removeOthers(directory: string, kept: ReadonlySet<string>): Promise<void> {
  const entries = await fs.readdir(directory, { recursive: true, withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.resolve(entry.parentPath, entry.name))
      .filter((file) => !kept.has(file))
      .map((file) => fs.rm(file, { force: true })),
  );
}

/**
 * The file of the module `customOptions.importPath` names, from the folder of the hooks, as the
 * React Query plugin writes it: a `.ts` file when the path has no extension.
 */
function customOptionsFile(outDir: string, importPath: string): string {
  return path.resolve(outDir, path.extname(importPath) ? importPath : `${importPath}.ts`);
}

/** The directory name of the generated tree, as the wrapper imports it. */
function treeDir(outputFile: string): string {
  return `./${path.basename(stripExtension(outputFile))}`;
}

/** Generate an axios client using Kubb. */
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
 * Generate a react-query client using Kubb.
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
      { baseName: CONTEXT_FILE, copy: template(CONTEXT_FILE) },
    ],
    wrapperSource: buildReactQueryWrapperSource({
      descriptors,
      shared,
      opsImport: `${dir}/clients`,
      hooksImport: `${dir}/hooks`,
      runtimeImport: `${dir}/.kubb/client`,
      typesImport: `${dir}/types`,
      schemasImport: `${dir}/schemas`,
      contextImport: `${dir}/context`,
      pluginOptions: options,
      inputSchemaNames: new Set(inputSchemas.keys()),
    }),
    // The plugin writes the module `customOptions` names, which its hooks import, when it is
    // not there: for the user to fill in.
    userFiles: options?.customOptions
      ? [customOptionsFile(stripExtension(outputFile), options.customOptions.importPath)]
      : [],
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
