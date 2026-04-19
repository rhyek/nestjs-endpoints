import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useMemo } from 'react';
import { api } from './generated/react-query-client';
import { Shop } from './shop/Shop';

const API_URL = 'http://localhost:3000';

export function App() {
  const queryClient = useMemo(() => new QueryClient(), []);
  const apiClient = useMemo(
    () => api.createReactQueryClient({ baseURL: API_URL }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={apiClient}>
        <Shop />
      </api.Provider>
    </QueryClientProvider>
  );
}
