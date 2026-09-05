import path from 'node:path';

type DefinePlugin = typeof import('@kubb/core').definePlugin;

/**
 * Inline Kubb plugin that emits our two hand-written artifacts as part of the
 * same `build()` pass: the runtime module (into the output dir) and the
 * namespaced wrapper (at `outputFile`). Nothing is written, post-processed, or
 * deleted by us outside the pipeline — `output.clean` prunes only Kubb's own
 * output directory, and the wrapper at `outputFile` is rewritten in full each
 * run.
 */
export function emitPlugin(
  definePlugin: DefinePlugin,
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
  return definePlugin(() => ({
    name,
    options: {},
    async install() {
      await this.addFile({
        baseName: 'client-runtime.ts',
        path: path.join(outDir, 'client-runtime.ts'),
        sources: [
          {
            name: 'client-runtime',
            value: runtimeSource,
            isExportable: true,
            isIndexable: false,
          },
        ],
        imports: [],
        exports: [],
      });
      await this.addFile({
        baseName: path.basename(outputFile) as `${string}.${string}`,
        path: outputFile,
        sources: [
          {
            name: 'createApiClient',
            value: wrapperSource,
            isExportable: true,
            isIndexable: false,
          },
        ],
        imports: [],
        exports: [],
      });
    },
  }))();
}
