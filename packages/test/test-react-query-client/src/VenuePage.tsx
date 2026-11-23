import React from 'react';
import { useApiClient } from '../../test-app-express/generated/react-query-client';

// `venueId` is a path parameter the endpoint's router declares.
export function VenuePage({ venueId }: { venueId: string }) {
  const apiClient = useApiClient();
  const { data, status } = apiClient.venues.useView(
    { path: { venueId } },
    { query: { retry: false } },
  );

  if (status !== 'success') {
    return <div>Loading...</div>;
  }
  return <div data-testid="venue">{data.venue}</div>;
}
