import { Test } from '@nestjs/testing';
import 'reflect-metadata';
import createRecipeEndpoint from '../src/endpoints/shop/recipes/create.endpoint';
import listRecipesEndpoint from '../src/endpoints/shop/recipes/list.endpoint';
import { RecipesRepository } from '../src/endpoints/shop/recipes/repository.service';

// Integration-style tests: each endpoint class is loaded directly (no
// HTTP server) and invoked via its `invoke()` helper. Providers are
// supplied through the testing module like any NestJS controller.

async function buildModule() {
  const moduleRef = await Test.createTestingModule({
    controllers: [listRecipesEndpoint, createRecipeEndpoint],
    providers: [RecipesRepository],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('recipes endpoints', () => {
  test('list starts empty', async () => {
    const app = await buildModule();
    const list = app.get(listRecipesEndpoint);
    await expect(list.invoke()).resolves.toEqual([]);
    await app.close();
  });

  test('create adds a recipe visible to list', async () => {
    const app = await buildModule();
    const create = app.get(createRecipeEndpoint);
    const list = app.get(listRecipesEndpoint);

    const created = await create.invoke({ name: 'Pizza' });
    expect(created).toEqual({ id: 1, name: 'Pizza' });

    await expect(list.invoke()).resolves.toEqual([
      { id: 1, name: 'Pizza' },
    ]);
    await app.close();
  });
});
