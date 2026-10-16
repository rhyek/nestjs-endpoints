import path from 'node:path';

type Kit = typeof import('kubb/kit');

/**
 * Inline Kubb plugin that emits our two hand-written artifacts as part of the
 * same build: the runtime module (into the output dir) and the namespaced
 * wrapper (at `outputFile`). Nothing is written, post-processed, or deleted by
 * us outside the pipeline — `output.clean` prunes only Kubb's own output
 * directory, and the wrapper at `outputFile` is rewritten in full each run.
 */
export function emitPlugin(
  kit: Kit,
  params: {
    name: string;
    outDir: string;
    outputFile: string;
    runtimeSource: string;
    wrapperSource: string;
  },
) {
  const { name, outDir, outputFile, runtimeSource, wrapperSource } =
    params;
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
      raw(
        'client-runtime.ts',
        path.join(outDir, 'client-runtime.ts'),
        runtimeSource,
      );
      raw(path.basename(outputFile), outputFile, wrapperSource);
      return options;
    },
  })({});
}
