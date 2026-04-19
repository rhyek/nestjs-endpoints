import React, { useState } from 'react';
import { api } from '../generated/react-query-client';

export function Recipes() {
  // Namespaced hooks come from the nested bucket that mirrors the
  // router hierarchy: shop/router.module.ts + shop/recipes/router.module.ts.
  const list = api.shop.recipes.useList();
  const create = api.shop.recipes.useCreate();
  const [name, setName] = useState('');

  return (
    <section>
      <h2>Recipes</h2>
      <ul>{list.data?.map((r) => <li key={r.id}>{r.name}</li>)}</ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name) {
            return;
          }
          void (async () => {
            await create.mutateAsync({ data: { name } });
            setName('');
            await list.refetch();
          })();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="new recipe"
        />
        <button type="submit" disabled={create.isPending}>
          Add
        </button>
      </form>
    </section>
  );
}
