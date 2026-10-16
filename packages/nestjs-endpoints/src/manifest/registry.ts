import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_IMPORT_EXTENSION, ImportExtension } from './render.js';

export type EndpointManifestLoader = () => Promise<unknown>;

export interface EndpointManifestDefinition {
  importExtension?: ImportExtension;
  /**
   * One loader per endpoint / router-module file, keyed by its POSIX path
   * relative to the manifest.
   */
  files: Record<string, EndpointManifestLoader>;
}

export interface RegisteredManifest {
  /** Absolute path of the running manifest module. */
  file: string;
  /** The manifest's directory; every key is relative to it. */
  dir: string;
  importExtension: ImportExtension;
  /** The keys as declared in the manifest file. */
  keys: readonly string[];
  /** Absolute path (with the key's extension) → loader. */
  loaders: ReadonlyMap<string, EndpointManifestLoader>;
  /** Absolute directory → its children, sorted; `true` marks a directory. */
  tree: ReadonlyMap<string, ReadonlyMap<string, boolean>>;
}

/**
 * Keyed by manifest file. A re-registration replaces the entry: when the
 * library outlives the app's module graph (Vitest keeps an externalized
 * dependency loaded while it re-evaluates the app per test file), the latest
 * loaders are the ones bound to the live graph.
 */
const registry = new Map<string, RegisteredManifest>();

/**
 * Called by a generated `endpoints.gen.ts`. Records the app's endpoint files
 * so file-based routers can find and load them.
 */
export function registerEndpointManifest(
  url: string,
  definition: EndpointManifestDefinition,
): void {
  const file = fileURLToPath(url);
  const keys = Object.keys(definition.files);
  registry.set(file, createManifest(file, definition, keys));
}

/**
 * Builds the registry entry, exposing only `loadableKeys` to routers.
 */
export function createManifest(
  file: string,
  definition: EndpointManifestDefinition,
  loadableKeys: readonly string[],
): RegisteredManifest {
  const dir = path.dirname(file);
  const loaders = new Map<string, EndpointManifestLoader>();
  const children = new Map<string, Map<string, boolean>>();
  const addChild = (parent: string, name: string, isDir: boolean) => {
    let entries = children.get(parent);
    if (!entries) {
      entries = new Map();
      children.set(parent, entries);
    }
    entries.set(name, isDir);
  };
  for (const key of loadableKeys) {
    const absolute = path.join(dir, ...key.split('/'));
    loaders.set(absolute, definition.files[key]);
    addChild(path.dirname(absolute), path.basename(absolute), false);
    for (
      let current = path.dirname(absolute);
      current !== dir;
      current = path.dirname(current)
    ) {
      addChild(path.dirname(current), path.basename(current), true);
    }
  }
  const tree = new Map(
    [...children].map(([parent, entries]) => [
      parent,
      new Map(
        [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ),
    ]),
  );
  return {
    file,
    dir,
    importExtension:
      definition.importExtension ?? DEFAULT_IMPORT_EXTENSION,
    keys: Object.keys(definition.files),
    loaders,
    tree,
  };
}

/** The most specific registered manifest whose directory contains `dir`. */
export function findManifestCovering(
  dir: string,
): RegisteredManifest | undefined {
  let best: RegisteredManifest | undefined;
  for (const manifest of registry.values()) {
    const covers =
      dir === manifest.dir || dir.startsWith(manifest.dir + path.sep);
    if (covers && (!best || manifest.dir.length > best.dir.length)) {
      best = manifest;
    }
  }
  return best;
}
