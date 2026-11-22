import { describe, expect, test } from 'vitest';
import type { EndpointDescriptor } from '../../descriptors';
import {
  buildClientObjectExpression,
  operationSourceName,
  stripNamespaceFromFlatName,
} from './buckets';

/** A minimal descriptor for the bucket builder. */
function descriptor(
  fields: Pick<EndpointDescriptor, 'operationId'> & Partial<EndpointDescriptor>,
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
const query: NonNullable<EndpointDescriptor['query']> = {
  json: { type: 'object', properties: { q: { type: 'string' } } },
  components: {},
  parameters: [{ name: 'q', required: false, schema: { type: 'string' }, shape: 'value' }],
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
    const target = (src: string, t: { method: string; hasRequest: boolean }) =>
      `${src}:${t.method}:${t.hasRequest}`;
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
    const target = (src: string, t: { hasRequest: boolean }) => `${src}:${t.hasRequest}`;
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

describe('operationSourceName', () => {
  test('names an operation as Kubb names its generated function', () => {
    // A digit followed by a lowercase letter starts a new word for Kubb.
    expect(operationSourceName('AuthOauth2callback')).toBe('authOauth2Callback');
    // A leading all-caps word keeps its case.
    expect(operationSourceName('V2Users')).toBe('V2Users');
    // A reserved word or a leading digit is not an identifier on its own.
    expect(operationSourceName('Delete')).toBe('_delete');
    expect(operationSourceName('2faVerify')).toBe('_2FaVerify');
  });

  test('the client object refers to the names Kubb generates', () => {
    const expr = buildClientObjectExpression({
      descriptors: [
        descriptor({ operationId: 'OauthOauth2callback', path: '/oauth/oauth2callback' }),
        descriptor({
          operationId: 'ShopV2Users',
          path: '/shop/v2/users',
          namespaceChain: ['shop', 'v2'],
        }),
      ],
      tagDescriptions: noTags,
      plainAccess: plain,
      hookAccess: hook,
      rootExtras: [],
    });
    expect(expr).toContain('oauthOauth2Callback: P(oauthOauth2Callback)');
    expect(expr).toContain('useOauthOauth2Callback: H(useOauthOauth2Callback)');
    expect(expr).toContain('users: P(shopV2Users)');
    expect(expr).toContain('useUsers: H(useShopV2Users)');
  });
});

describe('stripNamespaceFromFlatName', () => {
  test('returns the flat name unchanged when chain is empty', () => {
    expect(stripNamespaceFromFlatName('userCreate', [])).toBe('userCreate');
    expect(stripNamespaceFromFlatName('useUserCreate', [])).toBe('useUserCreate');
  });

  test('strips a single-segment chain from a plain function name', () => {
    expect(stripNamespaceFromFlatName('shopProductList', ['shop'])).toBe('productList');
  });

  test('strips a single-segment chain while preserving the use prefix', () => {
    expect(stripNamespaceFromFlatName('useShopProductList', ['shop'])).toBe('useProductList');
  });

  test('strips a multi-segment chain from a use-prefixed name', () => {
    expect(
      stripNamespaceFromFlatName('useShopCatalogFeaturedWeekUpdate', [
        'shop',
        'catalog',
        'featured',
      ]),
    ).toBe('useWeekUpdate');
  });

  test('strips a multi-segment chain from a plain function name', () => {
    expect(
      stripNamespaceFromFlatName('shopCatalogFeaturedWeekUpdate', ['shop', 'catalog', 'featured']),
    ).toBe('weekUpdate');
  });

  test('handles hyphenated segments (kebab → pascal)', () => {
    // segment 'user-profile' → token 'UserProfile'
    expect(stripNamespaceFromFlatName('userProfileAvatarGet', ['user-profile'])).toBe('avatarGet');
  });

  test('handles multi-word pascal segments in the chain', () => {
    expect(
      stripNamespaceFromFlatName('userProfileAccountSettingsUpdate', [
        'user-profile',
        'account-settings',
      ]),
    ).toBe('update');
  });

  test('leaves name unchanged when prefix does not match the chain', () => {
    // chain expects 'Shop...', body starts with 'Foo...'
    expect(stripNamespaceFromFlatName('fooBarBaz', ['shop'])).toBe('fooBarBaz');
    expect(stripNamespaceFromFlatName('useFooBarBaz', ['shop'])).toBe('useFooBarBaz');
  });

  test('leaves name unchanged on partial-token match (not at word boundary)', () => {
    // chain 'user' produces prefix 'User'; body 'UsernameList' starts
    // with 'User' but the next char is lowercase 'n' — not a word
    // boundary, so it's treated as a non-match and left as-is.
    expect(stripNamespaceFromFlatName('usernameList', ['user'])).toBe('usernameList');
  });

  test('leaves name unchanged when only a prefix of the chain matches', () => {
    // Body matches 'Shop' but not 'ShopCatalog'.
    expect(stripNamespaceFromFlatName('shopProductList', ['shop', 'catalog'])).toBe(
      'shopProductList',
    );
  });

  test('returns original when stripping would consume the whole name', () => {
    // Lenient: a full match leaves nothing to strip, so fall back to
    // the flat name unchanged (same rule as no-match). Consumers can
    // rename the endpoint if they want a cleaner leaf name.
    expect(stripNamespaceFromFlatName('shop', ['shop'])).toBe('shop');
    expect(stripNamespaceFromFlatName('useShop', ['shop'])).toBe('useShop');
    expect(stripNamespaceFromFlatName('shopRecipes', ['shop', 'recipes'])).toBe('shopRecipes');
  });
});
