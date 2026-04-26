import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useMemo } from 'react';
import { api } from '../../test-app-express-cjs/generated/react-query-client';
import { UserPage } from './UserPage';

interface AppProps {
  children?: React.ReactNode;
}

export function App({ children }: AppProps = {}) {
  const queryClient = useMemo(() => new QueryClient({}), []);
  const apiClient = useMemo(
    () =>
      api.createReactQueryClient({
        baseURL: `http://localhost:${import.meta.env.VITE_WEB_API_PORT}`,
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={apiClient}>
        {children ?? <UserPage />}
      </api.Provider>
    </QueryClientProvider>
  );
}
