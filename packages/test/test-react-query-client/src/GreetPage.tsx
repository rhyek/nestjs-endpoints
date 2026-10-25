import React, { useState } from 'react';
import { useApiClient } from '../../test-app-express/generated/react-query-client';

export function GreetPage() {
  const apiClient = useApiClient();
  const [name, setName] = useState('');
  const { data, error, status, refetch } = apiClient.useGreet(
    { body: { name } },
    {
      query: {
        enabled: !!name,
        retry: false,
      },
    },
  );

  return (
    <div>
      <div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
        />
        <button onClick={() => refetch()}>Greet</button>
      </div>

      {status === 'pending' && name && <div>Loading...</div>}

      {error && (
        <div>
          Error: {(error.response?.data as { message: string }).message}
        </div>
      )}

      {data && <div data-testid="greeting">{data}</div>}
    </div>
  );
}
