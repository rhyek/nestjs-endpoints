import React from 'react';
import { useApiClient } from '../../test-app-express/generated/react-query-client';

// `user/find` answers `null` for an id no user has: ids start at 1.
export function UserFindPage() {
  const apiClient = useApiClient();
  const { data, status } = apiClient.useUserFind({ body: { id: 0 } }, { query: { retry: false } });

  if (status !== 'success') {
    return <div>Loading...</div>;
  }
  return <div data-testid="user-find">{data === null ? 'No such user' : data.name}</div>;
}
