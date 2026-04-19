import fs from 'node:fs/promises';
import path from 'node:path';
import type { OpenAPIObject } from '@nestjs/swagger';
import { stripNamespaceFromFlatName } from './name-transform';

const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'delete',
  'patch',
  'head',
  'options',
  'trace',
] as const;

type ClientType = 'axios' | 'react-query';

/**
 * Two naming shapes are emitted per wrapper:
 *
 * - `plain` — camelCase identifiers matching the raw methods on the
 *   axios client (e.g. `shopRecipesCreate`). Used both for the
 *   `createAxiosClient` factory's returned object and for the RQ
 *   wrapper's `useAxios()` body, so `api.useAxios()` returns the same
 *   namespaced shape as `api.createAxiosClient(...)`.
 * - `hook` — `use` + PascalCase identifiers matching orval's emitted
 *   React Query hooks (e.g. `useShopRecipesCreate`). Used for the
 *   static `api.*` hook surface on the RQ wrapper.
 */
type Shape = 'plain' | 'hook';

type NamespacedOp = {
  namespaceChain: string[];
  /** Identifier on the flat module or the bound client. */
  sourceName: string;
  /** Property name on the nested api object after namespace stripping. */
  propertyName: string;
};

type BucketNode = {
  methods: Map<string, NamespacedOp>;
  buckets: Map<string, BucketNode>;
};

function emptyBucket(): BucketNode {
  return { methods: new Map(), buckets: new Map() };
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Mirror orval's operationId → identifier normalization: treat any
 * non-alphanumeric separator (underscore, hyphen, space) as a word
 * boundary and PascalCase the token on the right. Matches names like
 * NestJS's default `ControllerClass_methodName` operationId, which
 * orval emits as `controllerClassMethodName`.
 */
function normalizeOperationIdToPascal(operationId: string): string {
  let normalized = operationId.replace(
    /[^A-Za-z0-9]+([A-Za-z0-9])/g,
    (_, c: string) => c.toUpperCase(),
  );
  normalized = normalized.replace(/[^A-Za-z0-9]/g, '');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function collectOperations(
  document: OpenAPIObject,
  shape: Shape,
): NamespacedOp[] {
  const out: NamespacedOp[] = [];
  for (const pathItem of Object.values(document.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of HTTP_METHODS) {
      const op = (pathItem as Record<string, unknown>)[method] as
        | undefined
        | {
            operationId?: string;
            ['x-namespace']?: unknown;
          };
      if (!op || typeof op !== 'object') continue;
      if (!op.operationId) continue;
      const rawChain = op['x-namespace'];
      const namespaceChain = Array.isArray(rawChain)
        ? rawChain.filter((s): s is string => typeof s === 'string')
        : [];
      const pascal = normalizeOperationIdToPascal(op.operationId);
      const sourceName =
        shape === 'hook' ? 'use' + pascal : lowerFirst(pascal);
      const propertyName = stripNamespaceFromFlatName(
        sourceName,
        namespaceChain,
      );
      out.push({ namespaceChain, sourceName, propertyName });
    }
  }
  return out;
}

function placeOp(
  root: BucketNode,
  op: NamespacedOp,
  reservedRootNames: ReadonlySet<string>,
) {
  let bucket = root;
  const isRoot = op.namespaceChain.length === 0;
  for (const segment of op.namespaceChain) {
    if (bucket === root && reservedRootNames.has(segment)) {
      throw new Error(
        `Router namespace segment "${segment}" collides with a reserved ` +
          `api-object key. Rename the router namespace.`,
      );
    }
    let next = bucket.buckets.get(segment);
    if (!next) {
      if (bucket.methods.has(segment)) {
        throw new Error(
          `Namespace bucket "${segment}" collides with an operation of ` +
            `the same name at the same level. Rename the operation, the ` +
            `router namespace, or the exporting endpoint's path.`,
        );
      }
      next = emptyBucket();
      bucket.buckets.set(segment, next);
    }
    bucket = next;
  }
  const { propertyName, sourceName } = op;
  if (isRoot && reservedRootNames.has(propertyName)) {
    throw new Error(
      `Operation "${sourceName}" collides with a reserved api-object ` +
        `key "${propertyName}". Rename the endpoint or give the router ` +
        `an explicit namespace so the operation moves into a bucket.`,
    );
  }
  if (bucket.buckets.has(propertyName)) {
    throw new Error(
      `Operation "${sourceName}" (mapped to "${propertyName}") collides ` +
        `with a nested namespace bucket of the same name at the same ` +
        `level. Rename the operation or the conflicting router namespace.`,
    );
  }
  const existing = bucket.methods.get(propertyName);
  if (existing) {
    throw new Error(
      `Two operations resolve to the same wrapper property "${propertyName}" ` +
        `at the same level ("${existing.sourceName}" and "${sourceName}"). ` +
        `Rename one of the endpoints or adjust their namespaces.`,
    );
  }
  bucket.methods.set(propertyName, op);
}

function buildBucketRoot(
  ops: NamespacedOp[],
  reserved: ReadonlySet<string>,
): BucketNode {
  const root = emptyBucket();
  for (const op of ops) {
    placeOp(root, op, reserved);
  }
  return root;
}

/**
 * Quote bucket / method keys that aren't safe JS identifiers so the
 * emitted wrapper still parses. Most router-derived namespaces are
 * camelCase tokens that are safe bare; kebab-case segments get quoted.
 */
function safeKey(name: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return name;
  return JSON.stringify(name);
}

function serializeBucket(
  bucket: BucketNode,
  indent: string,
  sourceAccess: (sourceName: string) => string,
  chain: string[],
  tagDescriptions: Map<string, string>,
  rootExtras: string[] = [],
): string {
  const lines: string[] = ['{'];
  const inner = indent + '  ';
  for (const extra of rootExtras) {
    lines.push(`${inner}${extra},`);
  }
  for (const [name, op] of bucket.methods) {
    lines.push(
      `${inner}${safeKey(name)}: ${sourceAccess(op.sourceName)},`,
    );
  }
  for (const [name, child] of bucket.buckets) {
    const childChain = [...chain, name];
    const desc = tagDescriptions.get(childChain.join('/'));
    if (desc) {
      const safe = desc.replace(/\*\//g, '*\\/');
      if (safe.includes('\n')) {
        lines.push(`${inner}/**`);
        for (const raw of safe.split('\n')) {
          lines.push(`${inner} *${raw ? ` ${raw}` : ''}`);
        }
        lines.push(`${inner} */`);
      } else {
        lines.push(`${inner}/** ${safe} */`);
      }
    }
    lines.push(
      `${inner}${safeKey(name)}: ${serializeBucket(
        child,
        inner,
        sourceAccess,
        childChain,
        tagDescriptions,
      )},`,
    );
  }
  lines.push(`${indent}}`);
  return lines.join('\n');
}

function flatImportPath(
  flatOutputFile: string,
  wrapperOutputFile: string,
): string {
  const relativeDir = path.relative(
    path.dirname(wrapperOutputFile),
    path.dirname(flatOutputFile),
  );
  const base = path.basename(flatOutputFile, path.extname(flatOutputFile));
  const rel = relativeDir ? `${relativeDir}/${base}` : `./${base}`;
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/** Keys the axios client object (returned by createAxiosClient / useAxios) reserves. */
const PLAIN_CLIENT_RESERVED: ReadonlySet<string> = new Set(['axios']);

/** Keys the hook-surface `api` root reserves on the RQ wrapper. */
const HOOK_ROOT_RESERVED: ReadonlySet<string> = new Set([
  'createReactQueryClient',
  'Provider',
  'useAxios',
]);

export async function writeNamespacedWrapper(params: {
  document: OpenAPIObject;
  wrapperOutputFile: string;
  flatOutputFile: string;
  clientType: ClientType;
}): Promise<void> {
  const { document, wrapperOutputFile, flatOutputFile, clientType } =
    params;

  // The `plain` tree (camelCase, namespaced buckets) is used by both
  // wrappers for the axios-bound client surface.
  const plainOps = collectOperations(document, 'plain');
  const plainRoot = buildBucketRoot(plainOps, PLAIN_CLIENT_RESERVED);

  const tagDescriptions = new Map<string, string>();
  for (const tag of document.tags ?? []) {
    if (tag.name && typeof tag.description === 'string') {
      tagDescriptions.set(tag.name, tag.description);
    }
  }

  const importPath = flatImportPath(flatOutputFile, wrapperOutputFile);
  const header = [
    '/**',
    ' * Generated by nestjs-endpoints — do not edit manually.',
    ' *',
    ' * The orval-generated flat client lives in the sibling',
    ` * \`${path.basename(flatOutputFile)}\` file; this wrapper is the`,
    ' * consumer-facing entry point and only exposes the namespaced',
    ' * `api` object plus the `ApiClient` type.',
    ' */',
  ].join('\n');

  let body: string;
  if (clientType === 'react-query') {
    const hookOps = collectOperations(document, 'hook');
    const hookRoot = buildBucketRoot(hookOps, HOOK_ROOT_RESERVED);

    // The `useAxios()` hook body: wrap the flat client returned by
    // useApiClient() into the namespaced/axios shape, memoized on the
    // underlying client identity so the returned object is stable
    // across renders.
    const plainTreeForUseAxios = serializeBucket(
      plainRoot,
      '      ',
      (src) => `_client.${src}`,
      [],
      tagDescriptions,
      ['axios: _client.axios'],
    );
    const useAxiosExpr =
      `useAxios: () => {\n` +
      `    const _client = _flat.useApiClient();\n` +
      `    return _useMemo(() => (${plainTreeForUseAxios}), [_client]);\n` +
      `  }`;

    const hookTree = serializeBucket(
      hookRoot,
      '',
      (src) => `_flat.${src}`,
      [],
      tagDescriptions,
      [
        'createReactQueryClient: _flat.createApiClient',
        'Provider: _flat.ApiClientProvider',
        useAxiosExpr,
      ],
    );

    body =
      `import { useMemo as _useMemo } from 'react';\n` +
      `import * as _flat from '${importPath}';\n` +
      `export type * from '${importPath}';\n\n` +
      `export const api = ${hookTree} as const;\n` +
      `export type ApiClient = ReturnType<typeof api.useAxios>;\n`;
  } else {
    // The `api.createAxiosClient(config)` factory returns the same
    // namespaced/axios shape as the RQ wrapper's `useAxios()`.
    const plainTree = serializeBucket(
      plainRoot,
      '    ',
      (src) => `_client.${src}`,
      [],
      tagDescriptions,
      ['axios: _client.axios'],
    );
    body =
      `import { createApiClient as _createApiClient } from '${importPath}';\n` +
      `export type * from '${importPath}';\n\n` +
      `export const api = {\n` +
      `  createAxiosClient: (\n` +
      `    ...args: Parameters<typeof _createApiClient>\n` +
      `  ) => {\n` +
      `    const _client = _createApiClient(...args);\n` +
      `    return ${plainTree} as const;\n` +
      `  },\n` +
      `} as const;\n` +
      `export type ApiClient = ReturnType<typeof api.createAxiosClient>;\n`;
  }

  await fs.mkdir(path.dirname(wrapperOutputFile), { recursive: true });
  await fs.writeFile(wrapperOutputFile, header + '\n' + body, 'utf-8');
}
