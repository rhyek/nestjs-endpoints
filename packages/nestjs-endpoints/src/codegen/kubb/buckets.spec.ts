import { describe, expect, test } from 'vitest';
import type { EndpointDescriptor } from '../../descriptors.js';
import { buildClientObjectExpression } from './buckets.js';

/** A minimal descriptor for the bucket builder. */
function descriptor(
  fields: Pick<EndpointDescriptor, 'operationId'> &
    Partial<EndpointDescriptor>,
): EndpointDescriptor {
  return {
    kind: 'query',
    method: 'post',
    path: '/',
    pathParams: [],
    namespaceChain: [],
    tags: [],
    summary: '',
    outputs: [],
    ...fields,
  };
}

const input = { json: { type: 'object' }, components: {} };
const query: EndpointDescriptor['query'] = {
  json: { type: 'object', properties: { q: { type: 'string' } } },
  components: {},
  parameters: [{ name: 'q', required: false, schema: { type: 'string' } }],
};
const noTags = new Map<string, string>();

const plain = (src: string) => `P(${src})`;
const hook = (src: string) => `H(${src})`;

describe('buildClientObjectExpression', () => {
  test('nests namespaced ops and pairs plain + hook forms with stripped names', () => {
    const expr = buildClientObjectExpression({
      descriptors: [
        descriptor({
          operationId: 'AuthLogin',
          method: 'post',
          path: '/auth/login',
        }),
        descriptor({
          operationId: 'ShopCartAdd',
          path: '/shop/cart/add',
          namespaceChain: ['shop', 'cart'],
        }),
      ],
      tagDescriptions: noTags,
      plainAccess: plain,
      hookAccess: hook,
      rootExtras: ['axios: _axios'],
    });

    // Root extras first, then root-level un-namespaced op in both forms.
    expect(expr).toContain('axios: _axios');
    expect(expr).toContain('authLogin: P(authLogin)');
    expect(expr).toContain('useAuthLogin: H(useAuthLogin)');
    // Namespaced op nested under shop.cart, with the namespace prefix stripped
    // off the property name but the original source name preserved.
    expect(expr).toMatch(/shop:\s*\{/);
    expect(expr).toMatch(/cart:\s*\{/);
    expect(expr).toContain('add: P(shopCartAdd)');
    expect(expr).toContain('useAdd: H(useShopCartAdd)');
  });

  test('axios-only build (no hookAccess) omits the hook form', () => {
    const expr = buildClientObjectExpression({
      descriptors: [
        descriptor({
          operationId: 'AuthLogin',
          method: 'post',
          path: '/auth/login',
        }),
      ],
      tagDescriptions: noTags,
      plainAccess: plain,
      hookAccess: null,
      rootExtras: [],
    });
    expect(expr).toContain('authLogin: P(authLogin)');
    expect(expr).not.toContain('useAuthLogin');
  });

  test('quotes bucket / method keys that are not safe identifiers', () => {
    const expr = buildClientObjectExpression({
      descriptors: [
        descriptor({
          operationId: 'CheckIn',
          path: '/a',
          namespaceChain: ['check-out'],
        }),
      ],
      tagDescriptions: noTags,
      plainAccess: plain,
      hookAccess: null,
      rootExtras: [],
    });
    expect(expr).toContain('"check-out":');
  });

  test('throws when two operations resolve to the same wrapper property', () => {
    expect(() =>
      buildClientObjectExpression({
        descriptors: [
          descriptor({ operationId: 'Thing', path: '/foo' }),
          descriptor({ operationId: 'Thing', path: '/bar' }),
        ],
        tagDescriptions: noTags,
        plainAccess: plain,
        hookAccess: null,
        rootExtras: [],
      }),
    ).toThrow(/resolve to the same wrapper property/);
  });

  test('tells each operation whether it carries request data', () => {
    const target = (
      src: string,
      t: { method: string; hasRequest: boolean },
    ) => `${src}:${t.method}:${t.hasRequest}`;
    const expr = buildClientObjectExpression({
      descriptors: [
        descriptor({ operationId: 'None', path: '/none' }),
        descriptor({ operationId: 'Query', path: '/query', query }),
        descriptor({ operationId: 'Cookie', path: '/cookie' }),
        descriptor({
          operationId: 'Item',
          path: '/item/{id}',
          pathParams: [{ name: 'id', schema: { type: 'string' } }],
        }),
        descriptor({
          operationId: 'Ref',
          method: 'get',
          path: '/ref',
          query,
        }),
        descriptor({ operationId: 'Body', path: '/body', input }),
        descriptor({
          operationId: 'BodyRef',
          path: '/body-ref',
          input: {
            json: { $ref: '#/components/schemas/BodyRefInput' },
            components: { BodyRefInput: { type: 'object' } },
          },
        }),
      ],
      tagDescriptions: noTags,
      plainAccess: target,
      hookAccess: null,
      rootExtras: [],
    });
    expect(expr).toContain('none: none:post:false');
    expect(expr).toContain('query: query:post:true');
    // Neither path parameters, query nor input: no request argument.
    expect(expr).toContain('cookie: cookie:post:false');
    // Path parameters alone count.
    expect(expr).toContain('item: item:post:true');
    expect(expr).toContain('ref: ref:get:true');
    expect(expr).toContain('body: body:post:true');
    expect(expr).toContain('bodyRef: bodyRef:post:true');
  });

  test('a query carries request data only through its search parameters', () => {
    const target = (src: string, t: { hasRequest: boolean }) =>
      `${src}:${t.hasRequest}`;
    const expr = buildClientObjectExpression({
      descriptors: [
        // `query: z.object({})`: no search parameters, which Kubb gives no
        // request argument.
        descriptor({
          operationId: 'EmptyQuery',
          path: '/empty-query',
          query: { ...query, parameters: [] },
        }),
        descriptor({
          operationId: 'PathOnly',
          path: '/path-only/{id}',
          pathParams: [{ name: 'id', schema: { type: 'string' } }],
        }),
      ],
      tagDescriptions: noTags,
      plainAccess: target,
      hookAccess: null,
      rootExtras: [],
    });
    expect(expr).toContain('emptyQuery: emptyQuery:false');
    expect(expr).toContain('pathOnly: pathOnly:true');
  });

  test('throws when a namespace segment collides with a reserved root key', () => {
    expect(() =>
      buildClientObjectExpression({
        descriptors: [
          descriptor({
            operationId: 'AxiosThing',
            path: '/x',
            namespaceChain: ['axios'],
          }),
        ],
        tagDescriptions: noTags,
        plainAccess: plain,
        hookAccess: null,
        rootExtras: [],
      }),
    ).toThrow(/reserved/);
  });
});
