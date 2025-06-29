import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useMemo } from 'react';
import { createApiClient } from '../../test-app-express-cjs/generated/react-query-client';
import { ApiClientProvider } from '../../test-app-express-cjs/generated/react-query-client';
import { UserPage } from './UserPage';

interface AppProps {
  children?: React.ReactNode;
}

export function App({ children }: AppProps = {}) {
  const queryClient = useMemo(() => new QueryClient({}), []);
  const apiClient = useMemo(
    () =>
      createApiClient({
        baseURL: `http://localhost:${import.meta.env.VITE_WEB_API_PORT}`,
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        {children ?? <UserPage />}
      </ApiClientProvider>
    </QueryClientProvider>
  );
}
