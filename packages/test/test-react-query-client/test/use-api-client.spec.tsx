import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook } from '@testing-library/react';
import Axios from 'axios';
import React, { useMemo } from 'react';
import {
  ApiClientProvider,
  createApiClient,
  useApiClient,
  type ApiClient,
} from '../../test-app-express-cjs/generated/react-query-client';

function withProviders(apiClient: ApiClient) {
  return ({ children }: { children: React.ReactNode }) => {
    const queryClient = useMemo(() => new QueryClient(), []);
    return (
      <QueryClientProvider client={queryClient}>
        <ApiClientProvider client={apiClient}>
          {children}
        </ApiClientProvider>
      </QueryClientProvider>
    );
  };
}

describe('useApiClient()', () => {
  test('returns the namespaced shape with `.axios` exposed and hooks alongside axios methods', () => {
    const underlying = Axios.create({ baseURL: 'http://localhost:9999' });
    const apiClient = createApiClient(underlying);

    const { result } = renderHook(() => useApiClient(), {
      wrapper: withProviders(apiClient),
    });

    const client = result.current;
    // `.axios` is the exact axios instance wired into the wrapper.
    expect(client.axios).toBe(underlying);
    // Namespaced buckets carry both axios methods and react-query hooks.
    expect(typeof client.shop.recipes.create).toBe('function');
    expect(typeof client.shop.recipes.useCreate).toBe('function');
    expect(typeof client.shop.cart.add).toBe('function');
    expect(typeof client.shop.cart.useAdd).toBe('function');
    expect(typeof client.articles.latest).toBe('function');
    expect(typeof client.articles.useLatest).toBe('function');
    // Un-namespaced operations sit at root, also in both forms.
    expect(typeof client.greet).toBe('function');
    expect(typeof client.useGreet).toBe('function');
  });

  test('returned object is memoized across re-renders', () => {
    const apiClient = createApiClient({
      baseURL: 'http://localhost:9999',
    });

    const { result, rerender } = renderHook(() => useApiClient(), {
      wrapper: withProviders(apiClient),
    });

    const first = result.current;
    rerender();
    const second = result.current;
    // Same `_client` identity across renders → same wrapped object.
    expect(second).toBe(first);
  });

  test('rendered under <ApiClientProvider> — nested method is reachable', () => {
    const apiClient = createApiClient({
      baseURL: 'http://localhost:9999',
    });

    function Probe() {
      const client = useApiClient();
      // Type-level: `client.shop.cart.add(...)` must compile as a call.
      const call = client.shop.cart.add;
      return (
        <div data-testid="type">
          {typeof call === 'function' ? 'ok' : 'no'}
        </div>
      );
    }

    const { getByTestId } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ApiClientProvider client={apiClient}>
          <Probe />
        </ApiClientProvider>
      </QueryClientProvider>,
    );
    expect(getByTestId('type').textContent).toBe('ok');
  });
});
