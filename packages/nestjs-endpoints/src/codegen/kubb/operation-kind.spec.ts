import { describe, expect, test } from 'vitest';
import { operationKind, resolveOperationKinds } from './operation-kind.js';

describe('resolveOperationKinds', () => {
  test("defaults to the react-query plugin's own method lists", () => {
    expect(resolveOperationKinds(undefined)).toEqual({
      query: ['GET', 'QUERY'],
      mutation: ['POST', 'PUT', 'PATCH', 'DELETE'],
    });
  });

  test('takes custom methods, and false turns a kind off', () => {
    expect(
      resolveOperationKinds({
        query: false,
        mutation: { methods: ['POST'] },
      }),
    ).toEqual({ query: false, mutation: ['POST'] });
  });
});

describe('operationKind', () => {
  const kinds = resolveOperationKinds(undefined);

  test('classifies by method, case-insensitively', () => {
    expect(operationKind('get', kinds)).toBe('query');
    expect(operationKind('delete', kinds)).toBe('mutation');
  });

  test('a method neither list claims is neither', () => {
    expect(operationKind('head', kinds)).toBeUndefined();
    expect(
      operationKind('put', { query: ['GET'], mutation: ['POST'] }),
    ).toBeUndefined();
    expect(
      operationKind('get', { ...kinds, query: false }),
    ).toBeUndefined();
  });

  test('a method in both lists is a query', () => {
    expect(
      operationKind('post', { query: ['POST'], mutation: ['POST'] }),
    ).toBe('query');
  });
});
