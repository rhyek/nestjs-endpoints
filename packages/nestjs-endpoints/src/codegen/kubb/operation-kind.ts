/**
 * Which react-query helpers Kubb generates for each operation: a query hook
 * with `xQueryKey` / `xQueryOptions` for an `endpoint.query()`, a mutation
 * hook with `xMutationKey` / `xMutationOptions` for an `endpoint.mutation()`,
 * or nothing. The react-query plugin picks a kind by HTTP method, and every
 * endpoint is a POST unless it says otherwise, so `kindOverrides` hands the
 * plugin one `override` per operation that claims its method for its kind.
 * It and `operationKinds`, which the wrapper reads so it only refers to
 * helpers that exist, resolve the user's options as the plugin does:
 * `exclude`, then `include`, then the first matching `override`, whose
 * `query: false` or `mutation: false` still turns a kind off.
 */
import type { EndpointDescriptor } from '../../descriptors.js';
import type { EndpointKind } from '../../endpoint-fn.js';

type KindOption = false | Record<string, unknown> | undefined;

type Filter =
  | { type: string; pattern: string | RegExp }
  | { type: 'extension'; key: string; value?: unknown };

type Override = Filter & {
  options: { query?: KindOption; mutation?: KindOption } & Record<
    string,
    unknown
  >;
};

/** The react-query plugin options that decide an operation's kind. */
export type OperationKindOptions =
  | {
      query?: KindOption;
      mutation?: KindOption;
      include?: readonly Filter[];
      exclude?: readonly Filter[];
      override?: readonly Override[];
    }
  | undefined;

/**
 * The operations the plugin generates helpers for, each with the options
 * each kind resolves to, the user's first matching `override`, and `kind`,
 * the kind it gets helpers of: its builder's (`descriptor.kind`), unless
 * that kind's options are `false`.
 */
function resolveKinds(
  descriptors: readonly EndpointDescriptor[],
  options: OperationKindOptions,
) {
  const { include, exclude = [], override = [] } = options ?? {};
  return descriptors.flatMap((descriptor) => {
    const matches = (filter: Filter) =>
      matchesOperation(descriptor, filter);
    if (exclude.some(matches)) return [];
    if (include && !include.some(matches)) return [];
    const overridden = override.find(matches)?.options ?? {};
    const pick = (kind: EndpointKind) =>
      kind in overridden ? overridden[kind] : options?.[kind];
    const resolved = { query: pick('query'), mutation: pick('mutation') };
    return [
      {
        descriptor,
        overridden,
        ...resolved,
        kind:
          resolved[descriptor.kind] === false
            ? undefined
            : descriptor.kind,
      },
    ];
  });
}

/** The kind of each operation Kubb generates helpers for, by `operationId`. */
export function operationKinds(
  descriptors: readonly EndpointDescriptor[],
  options: OperationKindOptions,
): Map<string, EndpointKind> {
  const kinds = new Map<string, EndpointKind>();
  for (const { descriptor, kind } of resolveKinds(descriptors, options)) {
    if (kind) kinds.set(descriptor.operationId, kind);
  }
  return kinds;
}

/**
 * The `override` list the react-query plugin is given: per operation, the
 * user's first matching override with `query` and `mutation` replaced so the
 * operation's method is claimed only by the kind it gets helpers of (the one
 * `operationKinds` reports); then the user's own overrides, which only an
 * operation whose `operationId` a `macros` entry changed reaches. Override
 * options are taken as they are, not merged over the plugin's defaults, so
 * each kind carries the `importPath` the plugin would otherwise default to.
 */
export function kindOverrides(
  descriptors: readonly EndpointDescriptor[],
  options: OperationKindOptions,
): Override[] {
  return [
    ...resolveKinds(descriptors, options).map((resolved) => {
      const { descriptor, overridden, kind } = resolved;
      // A kind that claims nothing gets no methods rather than `false`: the
      // plugin's `hookOptionsGenerator` reads an override's `query: false`
      // as the top-level `query`, which claims GET by default.
      const claim = (claimant: EndpointKind) => ({
        importPath: '@tanstack/react-query',
        ...(resolved[claimant] || {}),
        methods:
          claimant === kind ? [descriptor.method.toUpperCase()] : [],
      });
      return {
        type: 'operationId',
        // A RegExp: `@kubb/core` reads a string pattern as a regular
        // expression, but the plugin's `hookOptionsGenerator` compares it
        // with `===`, and both test a RegExp.
        pattern: new RegExp(
          `^${descriptor.operationId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        ),
        options: {
          ...overridden,
          query: claim('query'),
          mutation: claim('mutation'),
        },
      };
    }),
    ...(options?.override ?? []),
  ];
}

/**
 * Kubb's `#matchesOperation`, over the operation the adapter builds from the
 * descriptor: a string pattern is a regular expression, an operation's input is
 * its one `application/json` content type, and `x-namespace` is its one
 * extension.
 */
function matchesOperation(
  descriptor: EndpointDescriptor,
  filter: Filter,
): boolean {
  if (filter.type === 'extension' && 'key' in filter) {
    const extensions: Record<string, unknown> =
      descriptor.namespaceChain.length > 0
        ? { 'x-namespace': descriptor.namespaceChain }
        : {};
    return (
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
      return descriptor.tags.some(test);
    case 'operationId':
      return test(descriptor.operationId);
    case 'path':
      return test(descriptor.path);
    case 'method':
      return test(descriptor.method);
    case 'contentType':
      return descriptor.input !== undefined && test('application/json');
    default:
      return false;
  }
}
