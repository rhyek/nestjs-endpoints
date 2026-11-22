import { useEffect, useState } from 'react';
import { useApiClient } from '../generated/react-query-client';
import { Catering } from './Catering';
import { Recipes } from './Recipes';

export function Shop() {
  // `useApiClient()` returns one object that exposes BOTH React Query
  // hooks (`useXxx`) and bound axios methods at every namespace bucket.
  const client = useApiClient();

  // Hook pattern — reacts to its own lifecycle and plugs into the
  // QueryClient cache.
  const homepage = client.shop.useHomepage();

  // Imperative pattern — useful for one-off calls.
  const [visitors, setVisitors] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void client.shop.stats().then((res) => {
      if (!cancelled) setVisitors(res.data.visitors);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <main>
      <h1>{homepage.data?.tagline ?? 'Loading…'}</h1>
      {visitors !== null && <p>Visitors so far: {visitors}</p>}
      <Recipes />
      <Catering />
    </main>
  );
}
