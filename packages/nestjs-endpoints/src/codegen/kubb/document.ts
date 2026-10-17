/**
 * Reading an OpenAPI document the way the generated client sees it: its
 * operations, the names the generated code gives them, and local `$ref`s.
 * Shared by the bucket builder (`./buckets`) and the input schemas
 * (`./input-schemas`), so the two always agree on which operation is which.
 */
import type { OpenAPIObject } from '@nestjs/swagger';
import { HTTP_METHODS, type HttpMethod } from '../http-methods.js';

export type Parameter = {
  name?: string;
  in?: string;
  required?: boolean;
  description?: string;
  schema?: unknown;
  $ref?: string;
};

export type RequestBody = {
  $ref?: string;
  content?: Record<string, { schema?: unknown }>;
};

export type PathItem = { parameters?: Parameter[] };

export type Operation = {
  operationId: string;
  tags?: unknown[];
  'x-namespace'?: unknown;
  parameters?: Parameter[];
  requestBody?: RequestBody;
};

/** Every operation that has an `operationId`, in path, then method, order. */
export function* documentOperations(document: OpenAPIObject): Generator<{
  path: string;
  pathItem: PathItem;
  method: HttpMethod;
  op: Operation;
}> {
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of HTTP_METHODS) {
      const op = (pathItem as Record<string, unknown>)[method] as
        Partial<Operation> | undefined;
      if (op && typeof op === 'object' && op.operationId) {
        yield { path, pathItem, method, op: op as Operation };
      }
    }
  }
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

/** The operation's request function on the generated flat module (`authLogin`). */
export function operationSourceName(operationId: string): string {
  const pascal = normalizeOperationIdToPascal(operationId);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function isLocalRef(ref: unknown): ref is `#/${string}` {
  return typeof ref === 'string' && ref.startsWith('#/');
}

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

/**
 * The operation's parameters, path-item ones included and `$ref`s followed.
 * An operation-level parameter replaces a path-level one with the same name
 * and location, as OpenAPI specifies.
 */
export function operationParameters(
  document: OpenAPIObject,
  pathItem: PathItem,
  op: Operation,
): Parameter[] {
  const byKey = new Map<string, Parameter>();
  for (const parameter of [
    ...(pathItem.parameters ?? []),
    ...(op.parameters ?? []),
  ]) {
    const resolved = deref(document, parameter);
    if (resolved) {
      byKey.set(`${resolved.in}:${resolved.name}`, resolved);
    }
  }
  return [...byKey.values()];
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
