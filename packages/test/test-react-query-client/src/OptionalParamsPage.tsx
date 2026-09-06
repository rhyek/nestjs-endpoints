import React from 'react';
import { useApiClient } from '../../test-app-express/generated/react-query-client';

export function OptionalParamsPage() {
  const apiClient = useApiClient();
  // Intentionally called with NO arguments. The generated method's `params`
  // argument is optional, so this exercises `bindHook`'s handling of an omitted
  // leading positional — the bound client must still be injected into the
  // (omitted) trailing options rather than sliding into the `params` slot.
  const { data, status, error } = apiClient.useOptionalParams();

  return (
    <div>
      {status === 'pending' && <div>Loading...</div>}
      {error && <div>Error</div>}
      {data && (
        <div data-testid="optional-result">{JSON.stringify(data)}</div>
      )}
    </div>
  );
}
