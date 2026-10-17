/**
 * Shared logic for turning an OpenAPI document into the nested, namespaced
 * client shape — operation collection (with `x-namespace` chains and
 * name normalization), bucket-tree assembly with collision detection, and
 * serialization to an object literal. Consumed by the axios and react-query
 * wrapper builders in `./kubb`, which supply the per-operation access
 * expressions.
 */
import type { OpenAPIObject } from '@nestjs/swagger';
import { HTTP_METHODS, type HttpMethod } from '../http-methods.js';
import { stripNamespaceFromFlatName } from './name-transform.js';

/**
 * Each operation is emitted in one of two forms inside its namespace bucket on
 * the wrapper's client object:
 *
 * - `plain` — camelCase axios method (e.g. `signOut`) bound to the client's
 *   axios instance via `bindClient`.
 * - `hook`  — `use` + PascalCase React Query hook (e.g. `useSignOut`) wrapped
 *   via `bindHook`, which reads its client from React context.
 *
 * The axios-only wrapper emits only the `plain` form. A plain and a hook
 * variant always land on different bucket keys (hook keys start with `use`), so
 * a single key never holds both.
 */
type Shape = 'plain' | 'hook';

/**
 * What the wrapper needs to know about an operation's generated function to
 * bind it: the HTTP method, and whether the operation carries request data
 * (path, query or header parameters, or a body), which decides whether a query
 * hook takes a leading request argument.
 */
export type OperationTarget = { method: HttpMethod; hasRequest: boolean };

type NamespacedOp = OperationTarget & {
  namespaceChain: string[];
  /** Identifier on the generated flat module / hooks barrel. */
  sourceName: string;
  /** Property name on the nested api object after namespace stripping. */
  propertyName: string;
};

/** One entry in a bucket: the emitted source name and which form it is. */
type BucketEntry = OperationTarget & {
  sourceName: string;
  variant: Shape;
};

type Access = (sourceName: string, target: OperationTarget) => string;

type BucketNode = {
  /** keyed by propertyName; exactly one op per key */
  methods: Map<string, BucketEntry>;
  buckets: Map<string, BucketNode>;
};

function emptyBucket(): BucketNode {
  return { methods: new Map(), buckets: new Map() };
}

export function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Normalize an operationId to an identifier: treat any non-alphanumeric
 * separator (underscore, hyphen, space) as a word boundary and PascalCase
 * the token on the right. Matches both the generated client's naming and
 * NestJS's default `ControllerClass_methodName` operationId (emitted as
 * `controllerClassMethodName`).
 */
export function normalizeOperationIdToPascal(operationId: string): string {
  let normalized = operationId.replace(
    /[^A-Za-z0-9]+([A-Za-z0-9])/g,
    (_, c: string) => c.toUpperCase(),
  );
  normalized = normalized.replace(/[^A-Za-z0-9]/g, '');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

type ParameterLike = { in?: string; $ref?: string };
type RequestBodyLike = {
  $ref?: string;
  content?: Record<string, { schema?: unknown }>;
};

/**
 * The value a local JSON pointer (`#/components/schemas/Name`) points at in
 * the document, with `~1` and `~0` unescaped; `undefined` when nothing is
 * there.
 */
export function resolveLocalRef(
  document: OpenAPIObject,
  ref: `#/${string}`,
): unknown {
  let target: unknown = document;
  for (const segment of ref.slice(2).split('/')) {
    target = (target as Record<string, unknown> | undefined)?.[
      segment.replace(/~1/g, '/').replace(/~0/g, '~')
    ];
  }
  return target;
}

/** Follows a local `#/components/<section>/<name>` reference. */
export function deref<T extends { $ref?: string }>(
  document: OpenAPIObject,
  value: T | undefined,
): T | undefined {
  const ref = value?.$ref;
  if (!isLocalRef(ref)) return value;
  return resolveLocalRef(document, ref) as T | undefined;
}

export function isLocalRef(ref: unknown): ref is `#/${string}` {
  return typeof ref === 'string' && ref.startsWith('#/');
}

/**
 * Whether Kubb gives the operation's generated functions a request argument:
 * any path, query or header parameter (path-item level included), or a request
 * body with a schema.
 */
function hasRequestData(
  document: OpenAPIObject,
  pathItem: { parameters?: ParameterLike[] },
  op: { parameters?: ParameterLike[]; requestBody?: RequestBodyLike },
): boolean {
  const parameters = [
    ...(pathItem.parameters ?? []),
    ...(op.parameters ?? []),
  ].map((parameter) => deref(document, parameter));
  if (
    parameters.some((parameter) =>
      ['path', 'query', 'header'].includes(parameter?.in ?? ''),
    )
  ) {
    return true;
  }
  const content = deref(document, op.requestBody)?.content;
  return Boolean(content && Object.values(content)[0]?.schema);
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
            parameters?: ParameterLike[];
            requestBody?: RequestBodyLike;
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
      out.push({
        namespaceChain,
        sourceName,
        propertyName,
        method,
        hasRequest: hasRequestData(document, pathItem, op),
      });
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
  const { propertyName, sourceName, method, hasRequest } = op;
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
  const existing = bucket.methods.get(propertyName);
  if (existing) {
    throw new Error(
      `Two operations resolve to the same wrapper property "${propertyName}" ` +
        `at the same level ("${existing.sourceName}" and "${sourceName}"). ` +
        `Rename one of the endpoints or adjust their namespaces.`,
    );
  }
  bucket.methods.set(propertyName, {
    sourceName,
    variant,
    method,
    hasRequest,
  });
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
  plainAccess: Access,
  hookAccess: Access | null,
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
    const access = entry.variant === 'hook' ? hookAccess : plainAccess;
    if (access) {
      lines.push(
        `${inner}${safeKey(name)}: ${access(entry.sourceName, entry)},`,
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

/** Reserved at the root of the namespaced client object. */
const ROOT_RESERVED: ReadonlySet<string> = new Set(['axios']);

function tagDescriptionsFrom(
  document: OpenAPIObject,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const tag of document.tags ?? []) {
    if (tag.name && typeof tag.description === 'string') {
      map.set(tag.name, tag.description);
    }
  }
  return map;
}

/**
 * Serialize an OpenAPI document into the nested, namespaced client object
 * literal — the single orchestration shared by the axios and react-query
 * wrapper builders. `plainAccess` maps an operation's flat (axios) source name
 * to the expression placed in the object; `hookAccess` does the same for the
 * paired React Query hook (pass `null` for an axios-only client). Both also get
 * the operation's {@link OperationTarget}. `rootExtras` are extra root-level
 * entries (e.g. the `.axios` passthrough).
 */
export function buildClientObjectExpression(params: {
  document: OpenAPIObject;
  plainAccess: Access;
  hookAccess: Access | null;
  rootExtras: string[];
  indent?: string;
}): string {
  const {
    document,
    plainAccess,
    hookAccess,
    rootExtras,
    indent = '    ',
  } = params;
  const plainOps = collectOperations(document, 'plain');
  const hookOps = hookAccess ? collectOperations(document, 'hook') : [];
  const root = buildBucketRoot(plainOps, hookOps, ROOT_RESERVED);
  return serializeBucket(
    root,
    indent,
    plainAccess,
    hookAccess,
    [],
    tagDescriptionsFrom(document),
    rootExtras,
  );
}
