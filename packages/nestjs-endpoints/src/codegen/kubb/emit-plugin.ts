import path from 'node:path';

type Kit = typeof import('kubb/kit');

/**
 * Inline Kubb plugin that emits our hand-written artifacts as part of the
 * same build: the modules in `files` (into the output dir: the runtime, and
 * for react-query `schemas.ts`) and the namespaced wrapper (at `outputFile`).
 * Nothing is written, post-processed, or deleted by us outside the pipeline —
 * `output.clean` prunes only Kubb's own output directory, and the wrapper at
 * `outputFile` is rewritten in full each run.
 */
export function emitPlugin(
  kit: Kit,
  params: {
    name: string;
    outDir: string;
    outputFile: string;
    /** Modules for the output dir, by file name. */
    files: { baseName: string; source: string }[];
    wrapperSource: string;
  },
) {
  const { name, outDir, outputFile, files, wrapperSource } = params;
  const { createSource, createText } = kit.ast.factory;
  const raw = (baseName: string, filePath: string, value: string) =>
    kit.injectFile({
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
  return kit.defineExtension({
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
