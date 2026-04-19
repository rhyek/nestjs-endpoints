import { api as axiosApi } from '../generated/axios-client';
import { api as rqApi } from '../generated/react-query-client';
import { api as shopRqApi } from '../generated/shop-react-query-client';

// Compile-time assertions.
//
// Leaf signatures flow through the wrapper unchanged — if the
// namespaced `api.createAxiosClient()` output ever loses a parameter or
// narrows its return type, these assignments stop type-checking.
type Client = ReturnType<typeof axiosApi.createAxiosClient>;
const _authLoginPreservesShape: Client['authLogin'] =
  null as unknown as Client['authLogin'];
const _shopCartAddPreservesShape: Client['shop']['cart']['add'] =
  null as unknown as Client['shop']['cart']['add'];
void _authLoginPreservesShape;
void _shopCartAddPreservesShape;

// The react-query wrapper's `useAxios()` must return the same shape as
// `createAxiosClient(cfg)` — .axios passthrough + namespaced buckets.
type RqUseAxios = ReturnType<typeof rqApi.useAxios>;
const _useAxiosHasAxios: RqUseAxios['axios'] =
  null as unknown as Client['axios'];
const _useAxiosHasNamespaced: RqUseAxios['shop']['cart']['add'] =
  null as unknown as Client['shop']['cart']['add'];
void _useAxiosHasAxios;
void _useAxiosHasNamespaced;

describe('namespace codegen wrappers', () => {
  test('full react-query api exposes every namespace bucket', () => {
    const keys = Object.keys(rqApi);
    expect(keys).toEqual(
      expect.arrayContaining(['shop', 'articles', 'secured']),
    );
    // Setup primitives live on `api` itself.
    expect(typeof rqApi.createReactQueryClient).toBe('function');
    expect(typeof rqApi.Provider).toBe('function');
    expect(typeof rqApi.useAxios).toBe('function');
    // Un-namespaced hooks sit at root with their full flat names.
    expect(typeof rqApi.useAuthLogin).toBe('function');
    // Namespaced hooks are stripped of their namespace prefix and
    // nested under buckets.
    expect(typeof rqApi.shop.usePromoToday).toBe('function');
    expect(typeof rqApi.shop.cart.useAdd).toBe('function');
    expect(typeof rqApi.shop.category.useList).toBe('function');
    expect(typeof rqApi.shop.recipes.useCreate).toBe('function');
    expect(typeof rqApi.articles.useLatest).toBe('function');
    expect(typeof rqApi.secured.useMe).toBe('function');
  });

  test('filtered shop react-query api contains only the shop namespace', () => {
    // Filter keeps setup primitives plus the `shop` bucket and nothing
    // else.
    const keys = Object.keys(shopRqApi).sort();
    expect(keys).toEqual(
      ['createReactQueryClient', 'Provider', 'useAxios', 'shop'].sort(),
    );
    expect(typeof shopRqApi.shop.usePromoToday).toBe('function');
    expect(typeof shopRqApi.shop.cart.useAdd).toBe('function');
    expect(typeof shopRqApi.shop.recipes.useCreate).toBe('function');
    // Buckets that belong to other top-level namespaces must not exist
    // on the filtered client.
    expect('articles' in shopRqApi).toBe(false);
    expect('secured' in shopRqApi).toBe(false);
    // Un-namespaced flat operations (e.g. greet) are also excluded
    // when a filter is in effect.
    expect('useGreet' in shopRqApi).toBe(false);
  });
});
