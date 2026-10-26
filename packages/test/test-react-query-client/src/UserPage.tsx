import React, { useEffect, useState } from 'react';
import { useApiClient } from '../../test-app-express/generated/react-query-client';

export function UserPage() {
  const apiClient = useApiClient();
  const { data, error, status, refetch } = apiClient.useUserGet(
    { body: { id: 1 } },
    {
      query: {
        retry: false,
      },
    },
  );
  const { mutateAsync: createUser } = apiClient.useUserCreate();

  const [purged, setPurged] = useState(false);
  useEffect(() => {
    void (async () => {
      await apiClient.userPurge();
      setPurged(true);
    })();
  }, [apiClient]);

  return (
    <div>
      {!purged || status === 'pending' ? (
        <div>Loading...</div>
      ) : (
        <>
          {error && (
            <div>Error: {(error.response?.data as { message: string } | undefined)?.message}</div>
          )}
          {data && (
            <div>
              <div>Name: {data.name}</div>
              <div>Email: {data.email}</div>
            </div>
          )}
        </>
      )}

      <div>
        <button
          type="button"
          onClick={async () => {
            await createUser({
              body: {
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
