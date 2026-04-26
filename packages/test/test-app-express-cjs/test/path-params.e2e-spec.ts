import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RecipesRepository } from '../src/endpoints/recipes/repository.service';
import { createApp } from './create-app';

// Covers the file-based routing convention `$param` → `:param` (TanStack-style)
// and the new `params` Zod-schema option on `endpoint(...)`.
//
// Routes exercised:
// - PATCH  /recipes/edit/:recipeId            (folder leaf $recipeId)
// - GET    /recipes/:recipeId/view            (folder $recipeId.view + endpoint.ts)
// - POST   /recipes/:recipeId/check-ingredients (nested folder $recipeId/...)
// - DELETE /recipes/:recipeId/delete          (file $recipeId.delete.endpoint.ts)
// - GET    /restaurant/:restaurantId/recipes/:recipeId/view (multi-param)

describe('path params via $-segment file-based routing', () => {
  async function setup() {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const { app } = await createApp(moduleFixture);
    app.useLogger(false);
    const repo = app.get(RecipesRepository);
    return { app, req: request(app.getHttpServer()), repo };
  }

  test('seeded recipe round-trips through edit / view / check / delete', async () => {
    const { app, req, repo } = await setup();
    try {
      // Seed via the existing create endpoint so we exercise the same
      // repository everything else reads from.
      const { body: created } = await req
        .get('/recipes/create')
        .query({ name: 'Pizza' })
        .expect(200);
      expect(created).toEqual({ id: 1, name: 'Pizza' });

      // edit/$recipeId — PATCH renames it.
      await req
        .patch('/recipes/edit/1')
        .send({ name: 'Margherita' })
        .expect(200, { id: 1, name: 'Margherita' });

      // Set ingredients directly on the repo so we can verify check.
      repo.update(1, { ingredients: ['flour', 'tomato', 'mozzarella'] });

      // $recipeId.view/endpoint.ts — GET returns the recipe.
      await req.get('/recipes/1/view').expect(200, {
        id: 1,
        name: 'Margherita',
        ingredients: ['flour', 'tomato', 'mozzarella'],
      });

      // $recipeId/check-ingredients.endpoint.ts — POST reports missing ones.
      await req
        .post('/recipes/1/check-ingredients')
        .send({ available: ['flour', 'tomato'] })
        .expect(200, { missing: ['mozzarella'], ok: false });

      await req
        .post('/recipes/1/check-ingredients')
        .send({ available: ['flour', 'tomato', 'mozzarella', 'basil'] })
        .expect(200, { missing: [], ok: true });

      // $recipeId.delete.endpoint.ts — DELETE returns the removed recipe.
      await req
        .delete('/recipes/1/delete')
        .expect(200, { id: 1, name: 'Margherita' });

      // After deletion the view endpoint should 404 (NotFoundException
      // is thrown by the repo).
      await req.get('/recipes/1/view').expect(404);
    } finally {
      await app.close();
    }
  });

  test('coerces numeric path params and surfaces validation errors', async () => {
    const { app, req } = await setup();
    try {
      await req
        .patch('/recipes/edit/not-a-number')
        .send({ name: 'X' })
        .expect(400, {
          statusCode: 400,
          message: 'Validation failed',
          errors: [
            {
              expected: 'number',
              code: 'invalid_type',
              received: 'NaN',
              path: ['recipeId'],
              message: 'Invalid input: expected number, received NaN',
            },
          ],
        });
    } finally {
      await app.close();
    }
  });

  test('multi-param path: restaurant/:restaurantId/recipes/:recipeId/view', async () => {
    const { app, req } = await setup();
    try {
      await req
        .get('/restaurant/7/recipes/42/view')
        .expect(200, { restaurantId: 7, recipeId: 42 });
    } finally {
      await app.close();
    }
  });
});
