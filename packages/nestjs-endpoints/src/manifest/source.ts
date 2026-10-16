import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_EXTENSION = /\.[mc]?ts$/;
const SOURCE_MAPPING_URL = /\/\/# sourceMappingURL=(\S+)\s*$/;

/**
 * The source file of the running manifest module, or `undefined` when it
 * cannot be found.
 *
 * Run from source (tsx, Vite, Node's type stripping), the module is its own
 * source. Run compiled (e.g. `nest start --watch` runs `dist/`), the source is
 * whatever the emitted source map — external or inline — names.
 */
export function locateSourceManifest(
  runningFile: string,
): string | undefined {
  if (SOURCE_EXTENSION.test(runningFile)) {
    return runningFile;
  }
  try {
    const code = fs.readFileSync(runningFile, 'utf8');
    const url = SOURCE_MAPPING_URL.exec(code)?.[1];
    if (!url) return undefined;
    const { map, mapDir } = readSourceMap(url, path.dirname(runningFile));
    const source = map.sources?.[0];
    if (!source) return undefined;
    const sourceFile = source.startsWith('file:')
      ? fileURLToPath(source)
      : path.resolve(mapDir, map.sourceRoot ?? '', source);
    return SOURCE_EXTENSION.test(sourceFile) && fs.existsSync(sourceFile)
      ? sourceFile
      : undefined;
  } catch {
    return undefined;
  }
}

interface SourceMap {
  sourceRoot?: string;
  sources?: string[];
}

function readSourceMap(
  url: string,
  fileDir: string,
): { map: SourceMap; mapDir: string } {
  const inline =
    /^data:application\/json;(?:charset=[^;]+;)?base64,(.*)$/.exec(url);
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
