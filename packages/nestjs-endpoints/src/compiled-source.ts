import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_EXTENSION = /\.[mc]?ts$/;
const SOURCE_MAPPING_URL = /\/\/# sourceMappingURL=(\S+)\s*$/;

interface SourceMap {
  sourceRoot?: string;
  sources?: string[];
}

/**
 * The source file of a module the app runs, whether or not it still exists.
 * A TypeScript file is its own source; a compiled one is whatever its source
 * map, external or inline, names. `undefined` when there is no map to read.
 */
export function sourceFileOf(runningFile: string): string | undefined {
  if (SOURCE_EXTENSION.test(runningFile)) {
    return runningFile;
  }
  try {
    const code = fs.readFileSync(runningFile, 'utf8');
    const url = SOURCE_MAPPING_URL.exec(code)?.[1];
    if (!url) {
      return undefined;
    }
    const { map, mapDir } = readSourceMap(url, path.dirname(runningFile));
    const source = map.sources?.[0];
    if (!source) {
      return undefined;
    }
    return source.startsWith('file:')
      ? fileURLToPath(source)
      : path.resolve(mapDir, map.sourceRoot ?? '', source);
  } catch {
    return undefined;
  }
}

function readSourceMap(url: string, fileDir: string): { map: SourceMap; mapDir: string } {
  const inline = /^data:application\/json;(?:charset=[^;]+;)?base64,(.*)$/.exec(url);
  if (inline) {
    const json = Buffer.from(inline[1], 'base64').toString('utf8');
    return { map: JSON.parse(json) as SourceMap, mapDir: fileDir };
  }
  const mapFile = path.resolve(fileDir, decodeURIComponent(url));
  return {
    map: JSON.parse(fs.readFileSync(mapFile, 'utf8')) as SourceMap,
    mapDir: path.dirname(mapFile),
  };
}

/**
 * Tells a compiled file whose source file was deleted: a compiler that
 * watches (`tsc --watch`, which `nest start --watch` runs) leaves its output
 * behind, and a router that only looked at the output would keep serving it.
 *
 * That can be known only where the app runs next to its source, which is
 * decided from `rootFile`, the file that created the router: its source map
 * names a file that exists. An app with no source maps or no source tree (a
 * deployment) is told nothing is gone.
 */
export function sourceGoneFilter(rootFile: string): (runningFile: string) => boolean {
  const rootSource = sourceFileOf(rootFile);
  if (rootSource === undefined || rootSource === rootFile || !fs.existsSync(rootSource)) {
    return () => false;
  }
  return (runningFile) => {
    const source = sourceFileOf(runningFile);
    return source !== undefined && !fs.existsSync(source);
  };
}
