import type { QueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../../test-app-express/generated/react-query-client';

/** A route loader's way in: no React, just the query client and the api. */
export function loadGreeting(
  queryClient: QueryClient,
  api: ApiClient,
  name: string,
) {
  return queryClient.ensureQueryData(
    api.greet.queryOptions({ body: { name } }),
  );
}
