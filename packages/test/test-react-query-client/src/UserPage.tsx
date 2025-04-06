import React from 'react';
import {
  useUserCreate,
  useUserGet,
} from '../../test-app-express-cjs/generated/react-query-client';

export function UserPage() {
  const { data, error, status, refetch } = useUserGet(
    {
      id: 1,
    },
    {
      query: {
        retry: false,
      },
    },
  );
  const { mutateAsync: createUser } = useUserCreate();
  return (
    <div>
      {status === 'pending' && <div>Loading...</div>}
      {error && (
        <div>
          Error: {(error.response?.data as { message: string }).message}
        </div>
      )}
      {data && (
        <div>
          <div>Name: {data.name}</div>
          <div>Email: {data.email}</div>
        </div>
      )}
      <div>
        <button
          onClick={async () => {
            await createUser({
              data: {
                name: 'John Doe',
                email: 'john.doe@example.com',
              },
            });
            await refetch();
          }}
        >
          Create User
        </button>
      </div>
    </div>
  );
}
