import {
  createApiClient as createAxiosApiClient,
  type ApiClient as AxiosApiClient,
} from '../generated/axios-client';
import {
  createApiClient as createRqApiClient,
  type ApiClient as RqApiClient,
} from '../generated/react-query-client';
import { createApiClient as createShopRqApiClient } from '../generated/shop-react-query-client';

// Compile-time assertions.
//
// Leaf signatures flow through the wrapper unchanged — if `createApiClient()`
// ever loses a parameter or narrows its return type, these assignments
// stop type-checking.
const _authLoginPreservesShape: AxiosApiClient['authLogin'] =
  null as unknown as AxiosApiClient['authLogin'];
const _shopCartAddPreservesShape: AxiosApiClient['shop']['cart']['add'] =
  null as unknown as AxiosApiClient['shop']['cart']['add'];
void _authLoginPreservesShape;
void _shopCartAddPreservesShape;

// The react-query wrapper's client must match the axios client's namespaced
// shape (`.axios` passthrough + the same buckets), and additionally expose
// per-namespace `useXxx` hooks alongside the axios methods.
const _rqHasAxios: RqApiClient['axios'] =
  null as unknown as AxiosApiClient['axios'];
const _rqHasNamespaced: RqApiClient['shop']['cart']['add'] =
  null as unknown as AxiosApiClient['shop']['cart']['add'];
const _rqHasHooksAlongsideAxiosMethods: RqApiClient['shop']['cart']['useAdd'] =
  null as unknown as RqApiClient['shop']['cart']['useAdd'];
void _rqHasAxios;
void _rqHasNamespaced;
void _rqHasHooksAlongsideAxiosMethods;

describe('namespace codegen wrappers', () => {
  test('full react-query client exposes every namespace bucket plus paired hooks', () => {
    // Build a client without making any HTTP calls — we only inspect
    // structure here.
    const client = createRqApiClient({ baseURL: 'http://localhost' });
    const keys = Object.keys(client);
    expect(keys).toEqual(
      expect.arrayContaining(['shop', 'articles', 'secured', 'axios']),
    );
    // Un-namespaced ops sit at root in BOTH axios and hook form.
    expect(typeof client.authLogin).toBe('function');
    expect(typeof client.useAuthLogin).toBe('function');
    // Namespaced buckets carry both axios methods and the hook for each op.
    expect(typeof client.shop.promoToday).toBe('function');
    expect(typeof client.shop.usePromoToday).toBe('function');
    expect(typeof client.shop.cart.add).toBe('function');
    expect(typeof client.shop.cart.useAdd).toBe('function');
    expect(typeof client.shop.category.list).toBe('function');
    expect(typeof client.shop.category.useList).toBe('function');
    expect(typeof client.shop.recipes.create).toBe('function');
    expect(typeof client.shop.recipes.useCreate).toBe('function');
    expect(typeof client.articles.latest).toBe('function');
    expect(typeof client.articles.useLatest).toBe('function');
    expect(typeof client.secured.me).toBe('function');
    expect(typeof client.secured.useMe).toBe('function');
  });

  test('filtered shop react-query client contains only the shop namespace', () => {
    const client = createShopRqApiClient({ baseURL: 'http://localhost' });
    const keys = Object.keys(client);
    expect(keys).toEqual(['axios', 'shop'].sort());
    expect(typeof client.shop.promoToday).toBe('function');
    expect(typeof client.shop.usePromoToday).toBe('function');
    expect(typeof client.shop.cart.add).toBe('function');
    expect(typeof client.shop.cart.useAdd).toBe('function');
    expect(typeof client.shop.recipes.create).toBe('function');
    expect(typeof client.shop.recipes.useCreate).toBe('function');
    // Buckets that belong to other top-level namespaces must not exist
    // on the filtered client.
    expect('articles' in client).toBe(false);
    expect('secured' in client).toBe(false);
    // Un-namespaced flat operations (e.g. greet) are also excluded
    // when a filter is in effect.
    expect('greet' in client).toBe(false);
    expect('useGreet' in client).toBe(false);
  });

  test('axios-only wrapper omits hooks but mirrors namespaced shape', () => {
    const client = createAxiosApiClient({ baseURL: 'http://localhost' });
    expect(typeof client.shop.cart.add).toBe('function');
    // Axios output is non-React and must not carry hook references.
    expect('useAdd' in client.shop.cart).toBe(false);
    expect('useAuthLogin' in client).toBe(false);
  });
});
