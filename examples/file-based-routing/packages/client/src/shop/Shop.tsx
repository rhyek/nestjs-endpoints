import { useEffect, useState } from 'react';
import { api } from '../generated/react-query-client';
import { Catering } from './Catering';
import { Recipes } from './Recipes';

export function Shop() {
  // The hook pattern: `api.<namespace>.useX()` reacts to its own
  // lifecycle and plugs into the QueryClient cache.
  const homepage = api.shop.useHomepage();

  // The imperative pattern: `api.useAxios()` returns the same
  // namespaced shape as `api.createAxiosClient(...)` bound to the
  // axios instance set up by the provider — useful for one-off calls.
  const client = api.useAxios();
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
