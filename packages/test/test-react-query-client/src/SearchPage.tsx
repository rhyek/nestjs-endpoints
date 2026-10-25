import React, { useState } from 'react';
import { useApiClient } from '../../test-app-express/generated/react-query-client';

export function SearchPage() {
  const apiClient = useApiClient();
  const [page, setPage] = useState(1);
  // `search` is an `endpoint.query()` that is a POST: it still gets the
  // query hook, with search params and a body in one request.
  const { data } = apiClient.useSearch(
    { query: { page }, body: { term: 'pizza' } },
    { query: { retry: false } },
  );

  return (
    <div>
      <button onClick={() => setPage((p) => p + 1)}>Next page</button>
      {data && (
        <div data-testid="search-result">{JSON.stringify(data)}</div>
      )}
    </div>
  );
}
