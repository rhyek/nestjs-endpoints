import { describe, expect, test } from 'vitest';
import type { EndpointDescriptor } from '../../descriptors';
import { kindOverrides, operationKinds } from './operation-kind';

/** A minimal descriptor for the kind classifier. */
function descriptor(
  fields: Pick<EndpointDescriptor, 'operationId' | 'kind' | 'method' | 'path'> &
    Partial<EndpointDescriptor>,
): EndpointDescriptor {
  return {
    pathParams: [],
    namespaceChain: [],
    tags: [],
    summary: '',
    outputs: [],
    ...fields,
  };
}

const descriptors = [
  descriptor({
    operationId: 'Greet',
    kind: 'query',
    method: 'get',
    path: '/greet',
    tags: ['public'],
  }),
  descriptor({
    operationId: 'AuthLogin',
    kind: 'mutation',
    method: 'post',
    path: '/auth/login',
    tags: ['auth'],
  }),
  descriptor({
    operationId: 'Upload',
    kind: 'mutation',
    method: 'put',
    path: '/upload',
    namespaceChain: ['internal'],
    input: { json: { type: 'object' }, components: {} },
  }),
  descriptor({
    operationId: 'Find',
    kind: 'query',
    method: 'post',
    path: '/find',
  }),
];

type Options = Parameters<typeof operationKinds>[1];
const kinds = (options: Options) => Object.fromEntries(operationKinds(descriptors, options));

describe('operationKinds', () => {
  test('takes the kind of the builder, whatever the method', () => {
    expect(kinds(undefined)).toEqual({
      Greet: 'query',
      AuthLogin: 'mutation',
      Upload: 'mutation',
      Find: 'query',
    });
  });

  test('false turns a kind off', () => {
    expect(kinds({ query: false })).toEqual({
      AuthLogin: 'mutation',
      Upload: 'mutation',
    });
    expect(kinds({ mutation: false })).toEqual({
      Greet: 'query',
      Find: 'query',
    });
  });

  test('exclude leaves out what any filter matches, by each filter type', () => {
    expect(kinds({ exclude: [{ type: 'tag', pattern: 'auth' }] })).toEqual({
      Greet: 'query',
      Upload: 'mutation',
      Find: 'query',
    });
    expect(
      kinds({
        exclude: [{ type: 'operationId', pattern: '^(Greet|Upload)$' }],
      }),
    ).toEqual({ AuthLogin: 'mutation', Find: 'query' });
    expect(kinds({ exclude: [{ type: 'method', pattern: 'post' }] })).toEqual({
      Greet: 'query',
      Upload: 'mutation',
    });
    expect(kinds({ exclude: [{ type: 'path', pattern: /^\/auth\// }] })).toEqual({
      Greet: 'query',
      Upload: 'mutation',
      Find: 'query',
    });
    expect(kinds({ exclude: [{ type: 'contentType', pattern: 'json' }] })).toEqual({
      Greet: 'query',
      AuthLogin: 'mutation',
      Find: 'query',
    });
    expect(kinds({ exclude: [{ type: 'extension', key: 'x-namespace' }] })).toEqual({
      Greet: 'query',
      AuthLogin: 'mutation',
      Find: 'query',
    });
  });

  test('include keeps only what some filter matches', () => {
    expect(kinds({ include: [{ type: 'tag', pattern: 'public' }] })).toEqual({ Greet: 'query' });
    // As in Kubb: a schema-only include matches no operation.
    expect(kinds({ include: [{ type: 'schemaName', pattern: 'Anything' }] })).toEqual({});
  });

  test("the first matching override's query and mutation options apply", () => {
    expect(
      kinds({
        override: [
          {
            type: 'operationId',
            pattern: 'Greet',
            options: { query: false },
          },
          {
            type: 'operationId',
            pattern: 'Greet',
            options: { query: {} },
          },
          {
            type: 'method',
            pattern: 'put',
            options: { mutation: false },
          },
        ],
      }),
    ).toEqual({ AuthLogin: 'mutation', Find: 'query' });
  });
});

describe('kindOverrides', () => {
  const tanstack = '@tanstack/react-query';

  /** A pattern that matches the operation id `id`, and no longer one: what each override has. */
  const only = (id: string) => ({
    asymmetricMatch: (pattern: unknown) =>
      pattern instanceof RegExp &&
      pattern.test(id) &&
      !pattern.test(`x${id}`) &&
      !pattern.test(`${id}x`),
    toString: () => `a pattern of ${id} alone`,
  });

  test("claims each operation's method for its builder's kind alone", () => {
    expect(kindOverrides(descriptors, undefined)).toEqual([
      {
        type: 'operationId',
        pattern: only('Greet'),
        options: {
          query: { importPath: tanstack, methods: ['GET'] },
          mutation: { importPath: tanstack, methods: [] },
        },
      },
      {
        type: 'operationId',
        pattern: only('AuthLogin'),
        options: {
          query: { importPath: tanstack, methods: [] },
          mutation: { importPath: tanstack, methods: ['POST'] },
        },
      },
      {
        type: 'operationId',
        pattern: only('Upload'),
        options: {
          query: { importPath: tanstack, methods: [] },
          mutation: { importPath: tanstack, methods: ['PUT'] },
        },
      },
      {
        type: 'operationId',
        pattern: only('Find'),
        options: {
          query: { importPath: tanstack, methods: ['POST'] },
          mutation: { importPath: tanstack, methods: [] },
        },
      },
    ]);
  });

  test("keeps the user's options and overrides, and their false", () => {
    const own = {
      type: 'operationId',
      pattern: 'Find',
      options: { query: false as const, suspense: {} },
    };
    const overrides = kindOverrides(descriptors, {
      query: { importPath: 'my-query' },
      exclude: [{ type: 'tag', pattern: 'auth' }],
      override: [own],
    });
    expect(overrides.map((o) => 'pattern' in o && o.pattern)).toEqual([
      only('Greet'),
      only('Upload'),
      only('Find'),
      'Find',
    ]);
    expect(overrides[0].options.query).toEqual({
      importPath: 'my-query',
      methods: ['GET'],
    });
    expect(overrides[2].options).toEqual({
      query: { importPath: tanstack, methods: [] },
      mutation: { importPath: tanstack, methods: [] },
      suspense: {},
    });
    expect(overrides[3]).toBe(own);
  });

  test.each([
    ['A.b', ['AXb', 'Ab']],
    ['a+b', ['aab', 'ab']],
    ['x(y)', ['xy', 'x(y']],
    ['a|b', ['a', 'b']],
    ['a$b^', ['ab']],
    ['[ab]', ['a', 'b']],
    ['a\\b', ['a\\\\b', 'ab']],
  ])('matches the operation id %s literally', (operationId, others) => {
    const [override] = kindOverrides(
      [descriptor({ operationId, kind: 'query', method: 'post', path: '/a' })],
      undefined,
    );
    const pattern = ('pattern' in override && override.pattern) as RegExp;
    expect(pattern.test(operationId)).toBe(true);
    for (const other of others) {
      expect(pattern.test(other)).toBe(false);
    }
  });
});
