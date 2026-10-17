import { useMutation } from '@tanstack/react-query';
import React from 'react';
import { useApiClient } from '../../test-app-express/generated/react-query-client';

export function ProfilePage() {
  const api = useApiClient();
  const save = useMutation(api.profileUpdate.mutationOptions());

  return (
    <div>
      <button
        onClick={() =>
          save.mutate({ body: { name: ' Ana ', address: null } })
        }
      >
        Save
      </button>
      {save.data && (
        <pre data-testid="saved">{JSON.stringify(save.data)}</pre>
      )}
    </div>
  );
}
