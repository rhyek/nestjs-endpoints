import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook } from '@testing-library/react';
import Axios from 'axios';
import React, { useMemo } from 'react';
import { api } from '../../test-app-express-cjs/generated/react-query-client';

function withProviders(
  apiClient: ReturnType<typeof api.createReactQueryClient>,
) {
  return ({ children }: { children: React.ReactNode }) => {
    const queryClient = useMemo(() => new QueryClient(), []);
    return (
      <QueryClientProvider client={queryClient}>
        <api.Provider client={apiClient}>{children}</api.Provider>
      </QueryClientProvider>
    );
  };
}

describe('api.useAxios()', () => {
  test('returns the namespaced shape with `.axios` exposed', () => {
    const underlying = Axios.create({ baseURL: 'http://localhost:9999' });
    const apiClient = api.createReactQueryClient(underlying);

    const { result } = renderHook(() => api.useAxios(), {
      wrapper: withProviders(apiClient),
    });

    const client = result.current;
    // `.axios` is the exact axios instance wired into the wrapper.
    expect(client.axios).toBe(underlying);
    // Namespaced buckets exist and their leaves are callable.
    expect(typeof client.shop.recipes.create).toBe('function');
    expect(typeof client.shop.cart.add).toBe('function');
    expect(typeof client.articles.latest).toBe('function');
    // Un-namespaced operations sit at root.
    expect(typeof client.greet).toBe('function');
  });

  test('returned object is memoized across re-renders', () => {
    const apiClient = api.createReactQueryClient({
      baseURL: 'http://localhost:9999',
    });

    const { result, rerender } = renderHook(() => api.useAxios(), {
      wrapper: withProviders(apiClient),
    });

    const first = result.current;
    rerender();
    const second = result.current;
    // Same `_client` identity across renders → same wrapped object.
    expect(second).toBe(first);
  });

  test('rendered under <api.Provider> — nested method is reachable', () => {
    const apiClient = api.createReactQueryClient({
      baseURL: 'http://localhost:9999',
    });

    function Probe() {
      const client = api.useAxios();
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
        <api.Provider client={apiClient}>
          <Probe />
        </api.Provider>
      </QueryClientProvider>,
    );
    expect(getByTestId('type').textContent).toBe('ok');
  });
});
