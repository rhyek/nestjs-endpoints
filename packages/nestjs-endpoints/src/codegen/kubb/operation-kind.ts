/**
 * Which react-query helpers Kubb generates for an operation: a query hook with
 * `xQueryKey` / `xQueryOptions`, a mutation hook with `xMutationKey` /
 * `xMutationOptions`, or neither. Mirrors `@kubb/plugin-react-query`'s
 * `classifyOperation` and its option defaults, so the wrapper only refers to
 * helpers that exist.
 */

/** The methods each kind claims, or `false` when it is turned off. */
export type OperationKinds = {
  query: readonly string[] | false;
  mutation: readonly string[] | false;
};

type KindOption = false | { methods?: readonly string[] } | undefined;

export function resolveOperationKinds(
  options: { query?: KindOption; mutation?: KindOption } | undefined,
): OperationKinds {
  const resolve = (option: KindOption, defaults: readonly string[]) =>
    option === false ? false : (option?.methods ?? defaults);
  return {
    query: resolve(options?.query, ['GET', 'QUERY']),
    mutation: resolve(options?.mutation, [
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
    ]),
  };
}

/** A method both kinds claim is a query, as in Kubb. */
export function operationKind(
  method: string,
  kinds: OperationKinds,
): 'query' | 'mutation' | undefined {
  const claims = (methods: readonly string[] | false) =>
    methods !== false &&
    methods.some((m) => m.toLowerCase() === method.toLowerCase());
  if (claims(kinds.query)) return 'query';
  if (claims(kinds.mutation)) return 'mutation';
  return undefined;
}
