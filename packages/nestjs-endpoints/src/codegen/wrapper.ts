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
 * Each operation is emitted in two forms inside the same namespace
 * bucket on the wrapper's client object:
 *
 * - `plain`  — camelCase axios method (e.g. `signOut`) bound to the
 *   client's axios instance.
 * - `hook`   — `use` + PascalCase React Query hook (e.g. `useSignOut`)
 *   imported directly from the flat module (it reads its client from
 *   React context, so it doesn't need to be bound to this instance).
 *
 * The axios-only wrapper omits the `hook` form.
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
  /** keyed by propertyName; entries are present in plain and/or hook form */
  methods: Map<string, { plain?: NamespacedOp; hook?: NamespacedOp }>;
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
  variant: Shape,
  reservedRootNames: ReadonlySet<string>,
) {
  let bucket = root;
  const isRoot = op.namespaceChain.length === 0;
  for (const segment of op.namespaceChain) {
    if (bucket === root && reservedRootNames.has(segment)) {
      throw new Error(
        `Router namespace segment "${segment}" collides with a reserved ` +
          `client-object key. Rename the router namespace.`,
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
      `Operation "${sourceName}" collides with a reserved client-object ` +
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
  let entry = bucket.methods.get(propertyName);
  if (!entry) {
    entry = {};
    bucket.methods.set(propertyName, entry);
  }
  if (entry[variant]) {
    throw new Error(
      `Two operations resolve to the same wrapper property "${propertyName}" ` +
        `at the same level ("${entry[variant].sourceName}" and "${sourceName}"). ` +
        `Rename one of the endpoints or adjust their namespaces.`,
    );
  }
  entry[variant] = op;
}

function buildBucketRoot(
  plainOps: NamespacedOp[],
  hookOps: NamespacedOp[],
  reserved: ReadonlySet<string>,
): BucketNode {
  const root = emptyBucket();
  for (const op of plainOps) {
    placeOp(root, op, 'plain', reserved);
  }
  for (const op of hookOps) {
    placeOp(root, op, 'hook', reserved);
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
  plainAccess: (sourceName: string) => string,
  hookAccess: ((sourceName: string) => string) | null,
  chain: string[],
  tagDescriptions: Map<string, string>,
  rootExtras: string[] = [],
): string {
  const lines: string[] = ['{'];
  const inner = indent + '  ';
  for (const extra of rootExtras) {
    lines.push(`${inner}${extra},`);
  }
  for (const [name, entry] of bucket.methods) {
    if (entry.plain) {
      lines.push(
        `${inner}${safeKey(name)}: ${plainAccess(entry.plain.sourceName)},`,
      );
    }
    if (entry.hook && hookAccess) {
      lines.push(
        `${inner}${safeKey(name)}: ${hookAccess(entry.hook.sourceName)},`,
      );
    }
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
        plainAccess,
        hookAccess,
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

/** Reserved at the root of the namespaced client object. */
const ROOT_RESERVED: ReadonlySet<string> = new Set(['axios']);

export async function writeNamespacedWrapper(params: {
  document: OpenAPIObject;
  wrapperOutputFile: string;
  flatOutputFile: string;
  clientType: ClientType;
}): Promise<void> {
  const { document, wrapperOutputFile, flatOutputFile, clientType } =
    params;

  const plainOps = collectOperations(document, 'plain');
  const hookOps =
    clientType === 'react-query'
      ? collectOperations(document, 'hook')
      : [];
  const root = buildBucketRoot(plainOps, hookOps, ROOT_RESERVED);

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
    ' * consumer-facing entry point and exposes only the namespaced',
    ' * client surface plus the `ApiClient` type.',
    ' */',
  ].join('\n');

  let body: string;
  if (clientType === 'react-query') {
    // Both `createApiClient(config)` and `useApiClient()` return the
    // same namespaced shape: per-namespace buckets each holding the
    // axios methods (instance-bound) AND the React Query hooks (which
    // pull their client from React context, so they don't need
    // per-instance binding).
    const buildExpr = serializeBucket(
      root,
      '    ',
      (src) => `_client.${src}`,
      (src) => `_flat.${src}`,
      [],
      tagDescriptions,
      ['axios: _client.axios'],
    );
    body =
      `import {\n` +
      `  createElement as _createElement,\n` +
      `  useMemo as _useMemo,\n` +
      `  type ReactNode as _ReactNode,\n` +
      `} from 'react';\n` +
      `import * as _flat from '${importPath}';\n\n` +
      `export type * from '${importPath}';\n\n` +
      `// Hidden link from the public client value back to the underlying\n` +
      `// flat axios bag, so ApiClientProvider can put the flat client into\n` +
      `// React context (where the generated hooks read it from).\n` +
      `const _CLIENT_FLAT = Symbol.for('nestjs-endpoints:flat-client');\n\n` +
      `const _build = (_client: ReturnType<typeof _flat.createApiClient>) => {\n` +
      `  const client = ${buildExpr};\n` +
      `  Object.defineProperty(client, _CLIENT_FLAT, {\n` +
      `    value: _client,\n` +
      `    enumerable: false,\n` +
      `  });\n` +
      `  return client;\n` +
      `};\n\n` +
      `export const createApiClient = (\n` +
      `  ...args: Parameters<typeof _flat.createApiClient>\n` +
      `) => _build(_flat.createApiClient(...args));\n\n` +
      `export type ApiClient = ReturnType<typeof createApiClient>;\n\n` +
      `export const useApiClient = (): ApiClient => {\n` +
      `  const _client = _flat.useApiClient();\n` +
      `  return _useMemo(() => _build(_client), [_client]);\n` +
      `};\n\n` +
      `export const ApiClientProvider = ({\n` +
      `  client,\n` +
      `  children,\n` +
      `}: {\n` +
      `  client: ApiClient;\n` +
      `  children: _ReactNode;\n` +
      `}) =>\n` +
      `  _createElement(\n` +
      `    _flat.ApiClientContext.Provider,\n` +
      `    {\n` +
      `      value: (client as unknown as Record<symbol, ReturnType<typeof _flat.createApiClient>>)[_CLIENT_FLAT],\n` +
      `    },\n` +
      `    children,\n` +
      `  );\n`;
  } else {
    const buildExpr = serializeBucket(
      root,
      '    ',
      (src) => `_client.${src}`,
      null,
      [],
      tagDescriptions,
      ['axios: _client.axios'],
    );
    body =
      `import { createApiClient as _createApiClient } from '${importPath}';\n\n` +
      `export type * from '${importPath}';\n\n` +
      `export const createApiClient = (\n` +
      `  ...args: Parameters<typeof _createApiClient>\n` +
      `) => {\n` +
      `  const _client = _createApiClient(...args);\n` +
      `  return ${buildExpr};\n` +
      `};\n\n` +
      `export type ApiClient = ReturnType<typeof createApiClient>;\n`;
  }

  await fs.mkdir(path.dirname(wrapperOutputFile), { recursive: true });
  await fs.writeFile(wrapperOutputFile, header + '\n' + body, 'utf-8');
}
