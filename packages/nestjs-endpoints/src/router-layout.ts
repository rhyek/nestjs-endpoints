// Where a router is: the folders it looks in, its base path and its namespaces, from its own
// options and file and from the router above it.

import path from 'node:path';
import type { DynamicModule } from '@nestjs/common';
import type { moduleAls } from './helpers';
import type { RouterOptions } from './router-options';
import { routerFileRegex, shown } from './routing-files';
import { trimSlashes } from './url-params';
import { namesPathParam, routerFolderSegments } from './url-segments';

/** A router's layout, as the routers under it read it. */
export type ParentStore = NonNullable<ReturnType<typeof moduleAls.getStore>>;

/**
 * A nested router's file (without its extension) → the layout of the
 * router that discovered it, set before that router loads it. A router
 * module can be evaluated before its parent runs (a spec imports it, or a
 * file that imports it, first) or while another router runs, so the store
 * `create()` sees is not always its parent's.
 */
export const nestedRouterParents = new Map<string, ParentStore>();

/**
 * A namespace is a property of the generated clients: a word, or words joined by `-` or `_`.
 */
export const NAMESPACE_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;

export const notANamespaceName = (name: string) =>
  `"${name}", is not a name for a namespace: a name has letters, digits, "-" and "_", and ` +
  'starts with a letter.';

/** How a router lists another in its `routers`: with a base path in place of its own, or none. */
export type Listing = { basePath?: string };

/** What a router's layout is made from, of its options. */
type LayoutOptions = Pick<RouterOptions<any, any, any>, 'rootDirectory' | 'basePath' | 'namespace'>;

/** A router's layout. */
export type Layout = ReturnType<typeof layoutOf>;

/**
 * Where a router is: the folders it looks in, its base path and its namespaces. From its own
 * options and file, and from the router above it, `parentStore`: its parent, for one made
 * with `child()`, or the router that found it.
 */
export function layoutOf(
  callsiteFile: string,
  params: LayoutOptions | undefined,
  parentStore: ParentStore | undefined,
  listed?: Listing,
) {
  const definedAtDir = path.dirname(callsiteFile);
  const resolveDir = (dir: string) => {
    if (!path.isAbsolute(dir)) {
      return path.join(definedAtDir, dir);
    }
    return dir;
  };
  const rootDirectories = ((): string[] => {
    if (!params?.rootDirectory) {
      return [definedAtDir];
    }
    const raw = Array.isArray(params.rootDirectory) ? params.rootDirectory : [params.rootDirectory];
    return raw.map(resolveDir);
  })();
  const effectiveBasePath = ((): string => {
    if (listed) {
      // Under the base path of the router that lists it: the path that router registers it
      // with, or else its own, which is the name of its folder only in a router file.
      const own =
        listed.basePath ??
        params?.basePath ??
        (routerFileRegex.test(path.basename(callsiteFile)) ? path.basename(definedAtDir) : '');
      const segments = [parentStore?.parentBasePath ?? '', own].flatMap((part) =>
        part.split('/').filter(Boolean),
      );
      return '/' + segments.join('/');
    }
    if (params?.basePath !== undefined) {
      return params.basePath;
    }
    if (parentStore) {
      // A router in one of the folders the router above looks in, or under one, is at its
      // path from that folder; any other, at its path from the folder of that router's file.
      const matchingRoot = parentStore.parentRootDirectories.find(
        (r) => definedAtDir === r || definedAtDir.startsWith(r + path.sep),
      );
      let suffix: string;
      if (matchingRoot) {
        suffix =
          definedAtDir === matchingRoot
            ? path.basename(definedAtDir)
            : path.relative(matchingRoot, definedAtDir);
      } else {
        suffix = path.relative(parentStore.parentModuleDir, definedAtDir);
      }
      const segments = [
        ...parentStore.parentBasePath.split('/').filter(Boolean),
        ...suffix.split(path.sep).filter(Boolean).flatMap(routerFolderSegments),
      ];
      return segments.length > 0 ? '/' + segments.join('/') : '/';
    }
    // A router with none above it takes the name of its folder only in a router file: one
    // created in `app.module.ts`, or in any other file, is at the root.
    if (routerFileRegex.test(path.basename(callsiteFile))) {
      return '/' + routerFolderSegments(path.basename(definedAtDir)).join('/');
    }
    return '/';
  })();
  const parentNamespaceChain = parentStore?.parentNamespaceChain ?? [];
  const ownNamespaceSegment = ((): string | null => {
    const ns = params?.namespace;
    if (ns === undefined || ns === false) {
      return null;
    }
    if (typeof ns === 'string') {
      return ns;
    }
    // `true`: the router's `basePath` where it sets one, without the slashes around it, or
    // else the name of the folder of its router file.
    const fromBasePath = params?.basePath !== undefined ? trimSlashes(params.basePath) : undefined;
    // A folder that names a path parameter names no group of operations.
    const folder = path.basename(definedAtDir);
    const fromFolder =
      routerFileRegex.test(path.basename(callsiteFile)) && !namesPathParam(folder)
        ? folder
        : undefined;
    const name = fromBasePath || fromFolder;
    if (!name) {
      throw new Error(
        `${shown(callsiteFile)}: \`namespace: true\` has no name to take. It takes the ` +
          "router's `basePath`, or else the name of the folder of a router file, unless " +
          'that folder names a path parameter. Give `namespace` a string.',
      );
    }
    if (!NAMESPACE_NAME.test(name)) {
      throw new Error(
        `${shown(callsiteFile)}: its namespace, ${notANamespaceName(name)} Give ` +
          '`namespace` a string.',
      );
    }
    return name;
  })();
  const effectiveNamespaceChain = ownNamespaceSegment
    ? [...parentNamespaceChain, ownNamespaceSegment]
    : parentNamespaceChain;
  return { definedAtDir, rootDirectories, effectiveBasePath, effectiveNamespaceChain };
}

/** A router's layout, as the routers under it read it. */
export function storeOf(
  callsiteFile: string,
  layout: Layout,
  order: DynamicModule | undefined,
): ParentStore {
  return {
    order,
    parentRouterFile: callsiteFile,
    parentBasePath: trimSlashes(layout.effectiveBasePath),
    parentModuleDir: layout.definedAtDir,
    parentRootDirectories: layout.rootDirectories,
    parentNamespaceChain: layout.effectiveNamespaceChain,
  };
}
