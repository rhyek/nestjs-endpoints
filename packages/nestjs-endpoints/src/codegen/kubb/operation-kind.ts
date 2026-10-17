/**
 * Which react-query helpers Kubb generates for each operation: a query hook
 * with `xQueryKey` / `xQueryOptions`, a mutation hook with `xMutationKey` /
 * `xMutationOptions`, or nothing. Mirrors `@kubb/plugin-react-query` and the
 * `@kubb/core` resolver it runs under — `exclude`, then `include`, then the
 * first matching `override`, then `classifyOperation` over `query.methods` /
 * `mutation.methods` — so the wrapper only refers to helpers that exist.
 */
import type { OpenAPIObject } from '@nestjs/swagger';
import { deref, documentOperations, type Operation } from './document.js';

type KindOption = false | { methods?: readonly string[] } | undefined;

type Filter =
  | { type: string; pattern: string | RegExp }
  | { type: 'extension'; key: string; value?: unknown };

/** The react-query plugin options that decide an operation's kind. */
export type OperationKindOptions =
  | {
      query?: KindOption;
      mutation?: KindOption;
      include?: readonly Filter[];
      exclude?: readonly Filter[];
      override?: readonly (Filter & {
        options: { query?: KindOption; mutation?: KindOption };
      })[];
    }
  | undefined;

export type OperationKind = 'query' | 'mutation';

/** The kind of each operation Kubb generates helpers for, by `operationId`. */
export function operationKinds(
  document: OpenAPIObject,
  options: OperationKindOptions,
): Map<string, OperationKind> {
  const { include, exclude = [], override = [] } = options ?? {};
  const kinds = new Map<string, OperationKind>();
  for (const { path, method, op } of documentOperations(document)) {
    const target = { path, method, op, document };
    const matches = (filter: Filter) => matchesOperation(target, filter);
    if (exclude.some(matches)) continue;
    if (include && !include.some(matches)) continue;
    const overridden = override.find(matches)?.options ?? {};
    const query = methodsOf(
      'query' in overridden ? overridden.query : options?.query,
      ['GET', 'QUERY'],
    );
    const mutation = methodsOf(
      'mutation' in overridden ? overridden.mutation : options?.mutation,
      ['POST', 'PUT', 'PATCH', 'DELETE'],
    );
    // A method both claim is a query, as in Kubb.
    const kind = claims(query, method)
      ? 'query'
      : claims(mutation, method)
        ? 'mutation'
        : undefined;
    if (kind) {
      kinds.set(op.operationId, kind);
    }
  }
  return kinds;
}

function methodsOf(option: KindOption, defaults: readonly string[]) {
  return option === false ? [] : (option?.methods ?? defaults);
}

function claims(methods: readonly string[], method: string): boolean {
  return methods.some((m) => m.toLowerCase() === method);
}

/** Kubb's `#matchesOperation`: a string pattern is a regular expression. */
function matchesOperation(
  {
    path,
    method,
    op,
    document,
  }: {
    path: string;
    method: string;
    op: Operation;
    document: OpenAPIObject;
  },
  filter: Filter,
): boolean {
  if (filter.type === 'extension' && 'key' in filter) {
    const extensions = op as Record<string, unknown>;
    return (
      filter.key.startsWith('x-') &&
      Object.hasOwn(extensions, filter.key) &&
      (filter.value === undefined ||
        extensions[filter.key] === filter.value)
    );
  }
  if (!('pattern' in filter)) return false;
  const test = (value: string) =>
    typeof filter.pattern === 'string'
      ? new RegExp(filter.pattern).test(value)
      : value.match(filter.pattern) !== null;
  switch (filter.type) {
    case 'tag':
      return (op.tags ?? []).some((tag) => test(String(tag)));
    case 'operationId':
      return test(op.operationId);
    case 'path':
      return test(path);
    case 'method':
      return test(method);
    case 'contentType':
      return Object.keys(
        deref(document, op.requestBody)?.content ?? {},
      ).some(test);
    default:
      return false;
  }
}
