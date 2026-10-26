/**
 * Shared logic for turning the endpoints' descriptors into the nested,
 * namespaced client shape — operation collection (by `namespaceChain`, under
 * the names the generated code gives them), bucket-tree assembly with
 * collision detection, and serialization to an object literal. Consumed by
 * the axios and react-query wrapper builders in `./kubb`, which supply the
 * per-operation access expressions.
 */
import type { EndpointDescriptor } from '../../descriptors.js';
import type { HttpMethod } from '../http-methods.js';
import { stripNamespaceFromFlatName } from './name-transform.js';

/**
 * Normalize an operationId to an identifier: treat any non-alphanumeric
 * separator (underscore, hyphen, space) as a word boundary and PascalCase
 * the token on the right. Matches both the generated client's naming and
 * NestJS's default `ControllerClass_methodName` operationId (emitted as
 * `controllerClassMethodName`).
 */
export function normalizeOperationIdToPascal(operationId: string): string {
  let normalized = operationId.replace(/[^A-Za-z0-9]+([A-Za-z0-9])/g, (_, c: string) =>
    c.toUpperCase(),
  );
  normalized = normalized.replace(/[^A-Za-z0-9]/g, '');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/** The operation's request function on the generated flat module (`authLogin`). */
export function operationSourceName(operationId: string): string {
  const pascal = normalizeOperationIdToPascal(operationId);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

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
 * (path or query parameters, or a body), which decides whether a query hook
 * takes a leading request argument.
 */
export type OperationTarget = {
  operationId: string;
  method: HttpMethod;
  hasRequest: boolean;
};

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

/** `undefined` leaves the operation's key out of that form. */
type Access = (sourceName: string, target: OperationTarget) => string | undefined;

type BucketNode = {
  /** keyed by propertyName; exactly one op per key */
  methods: Map<string, BucketEntry>;
  buckets: Map<string, BucketNode>;
};

function emptyBucket(): BucketNode {
  return { methods: new Map(), buckets: new Map() };
}

/**
 * Whether Kubb gives the operation's generated functions a request argument:
 * any path parameter, any search parameter, or a body. A `query` object
 * without properties has no search parameters.
 */
function hasRequestData(d: EndpointDescriptor): boolean {
  return d.pathParams.length > 0 || (d.query?.parameters.length ?? 0) > 0 || d.input !== undefined;
}

function collectOperations(
  descriptors: readonly EndpointDescriptor[],
  shape: Shape,
): NamespacedOp[] {
  return descriptors.map((d) => {
    const sourceName =
      shape === 'hook'
        ? 'use' + normalizeOperationIdToPascal(d.operationId)
        : operationSourceName(d.operationId);
    return {
      namespaceChain: d.namespaceChain,
      sourceName,
      propertyName: stripNamespaceFromFlatName(sourceName, d.namespaceChain),
      operationId: d.operationId,
      method: d.method,
      hasRequest: hasRequestData(d),
    };
  });
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
  const { propertyName, sourceName, operationId, method, hasRequest } = op;
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
    operationId,
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
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
    return name;
  }
  return JSON.stringify(name);
}

function serializeBucket(
  bucket: BucketNode,
  indent: string,
  plainAccess: Access,
  hookAccess: Access | null,
  chain: string[],
  tagDescriptions: ReadonlyMap<string, string>,
  rootExtras: string[] = [],
): string {
  const lines: string[] = ['{'];
  const inner = indent + '  ';
  for (const extra of rootExtras) {
    lines.push(`${inner}${extra},`);
  }
  for (const [name, entry] of bucket.methods) {
    const access = entry.variant === 'hook' ? hookAccess : plainAccess;
    const expression = access?.(entry.sourceName, entry);
    if (expression !== undefined) {
      lines.push(`${inner}${safeKey(name)}: ${expression},`);
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

/**
 * Serialize the descriptors into the nested, namespaced client object
 * literal — the single orchestration shared by the axios and react-query
 * wrapper builders. `plainAccess` maps an operation's flat (axios) source name
 * to the expression placed in the object; `hookAccess` does the same for the
 * paired React Query hook (pass `null` for an axios-only client). Both also get
 * the operation's {@link OperationTarget}. `tagDescriptions` maps a namespace
 * chain joined with `/` to the description written above its bucket.
 * `rootExtras` are extra root-level entries (e.g. the `.axios` passthrough).
 */
export function buildClientObjectExpression(params: {
  descriptors: readonly EndpointDescriptor[];
  tagDescriptions: ReadonlyMap<string, string>;
  plainAccess: Access;
  hookAccess: Access | null;
  rootExtras: string[];
  indent?: string;
}): string {
  const {
    descriptors,
    tagDescriptions,
    plainAccess,
    hookAccess,
    rootExtras,
    indent = '    ',
  } = params;
  const plainOps = collectOperations(descriptors, 'plain');
  const hookOps = hookAccess ? collectOperations(descriptors, 'hook') : [];
  const root = buildBucketRoot(plainOps, hookOps, ROOT_RESERVED);
  return serializeBucket(root, indent, plainAccess, hookAccess, [], tagDescriptions, rootExtras);
}
