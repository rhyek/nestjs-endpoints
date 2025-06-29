import React, { useState } from 'react';
import { useGreet } from '../../test-app-express-cjs/generated/react-query-client';

export function GreetPage() {
  const [name, setName] = useState('');
  const { data, error, status, refetch } = useGreet(
    { name },
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
