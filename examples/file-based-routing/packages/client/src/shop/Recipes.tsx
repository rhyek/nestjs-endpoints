import React, { useState } from 'react';
import { api } from '../generated/react-query-client';

export function Recipes() {
  // Namespaced hooks come from the nested bucket that mirrors the
  // router hierarchy: shop/router.module.ts + shop/recipes/router.module.ts.
  const list = api.shop.recipes.useList();
  const create = api.shop.recipes.useCreate();
  // Path-param mutation — `useEdit` was generated from
  // shop/recipes/edit/$recipeId.endpoint.ts. Mutate with { recipeId, data }.
  const edit = api.shop.recipes.useEdit();
  const [name, setName] = useState('');

  const renameRecipe = async (recipeId: number) => {
    const next = window.prompt('New name?');
    if (!next) return;
    await edit.mutateAsync({ recipeId, data: { name: next } });
    await list.refetch();
  };

  return (
    <section>
      <h2>Recipes</h2>
      <ul>
        {list.data?.map((r) => (
          <li key={r.id}>
            {r.name}{' '}
            <button onClick={() => void renameRecipe(r.id)}>rename</button>
          </li>
        ))}
      </ul>
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
