import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useMemo } from 'react';
import {
  ApiClientProvider,
  createApiClient,
} from './generated/react-query-client';
import { Shop } from './shop/Shop';

const API_URL = 'http://localhost:3000';

export function App() {
  const queryClient = useMemo(() => new QueryClient(), []);
  const apiClient = useMemo(
    () => createApiClient({ baseURL: API_URL }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <Shop />
      </ApiClientProvider>
    </QueryClientProvider>
  );
}
