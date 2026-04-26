import path from 'node:path';
import { ApiQuery } from '@nestjs/swagger';
import { vi } from 'vitest';
import z from 'zod';
import { ApiQueries, getEndpointHttpPath } from './helpers';

vi.mock('@nestjs/swagger', () => ({
  ApiQuery: vi.fn(() => () => {}),
  ApiParam: vi.fn(() => () => {}),
}));

describe('ApiQueries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should create ApiQuery decorator for each key in schema', () => {
    const schema = z.object({ a: z.string() });
    ApiQueries(schema);

    expect(ApiQuery).toHaveBeenCalledTimes(1);
    expect(ApiQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'a',
        required: true,
        schema: { type: 'string' },
      }),
    );
  });

  test('should create ApiQuery decorators for an object schema with a preprocess', () => {
    const schema = z.preprocess((arg) => arg, z.object({ a: z.string() }));
    ApiQueries(schema);

    expect(ApiQuery).toHaveBeenCalledTimes(1);
    expect(ApiQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'a',
        required: true,
        schema: { type: 'string' },
      }),
    );
  });

  test('should create ApiQuery decorators for nested object schema', () => {
    const schema = z.object({
      a: z.string(),
      b: z.object({ c: z.string() }),
    });
    ApiQueries(schema);

    expect(ApiQuery).toHaveBeenCalledTimes(2);
    expect(ApiQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'a',
        required: true,
        schema: { type: 'string' },
      }),
    );
    expect(ApiQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'b',
        required: true,
        schema: {
          type: 'object',
          properties: { c: { type: 'string' } },
          required: ['c'],
        },
      }),
    );
  });
});

describe('getEndpointHttpPath ($-segment path params)', () => {
  // The fn walks up from the file's directory until it hits the
  // rootDirectory, so we anchor everything at /tmp/app/endpoints in
  // these tests.
  const root = path.join('/tmp', 'app', 'endpoints');
  const endpointPath = (rel: string) => path.join(root, rel);
  const subject = (rel: string) =>
    getEndpointHttpPath([root], '', endpointPath(rel)).httpPath;

  test('folder leaf $param: recipes/edit/$recipeId.endpoint.ts', () => {
    expect(subject('recipes/edit/$recipeId.endpoint.ts')).toBe(
      'recipes/edit/:recipeId',
    );
  });

  test('nested $param folder: recipes/$recipeId/check.endpoint.ts', () => {
    expect(subject('recipes/$recipeId/check.endpoint.ts')).toBe(
      'recipes/:recipeId/check',
    );
  });

  test('folder with .suffix: recipes/$recipeId.view/endpoint.ts', () => {
    expect(subject('recipes/$recipeId.view/endpoint.ts')).toBe(
      'recipes/:recipeId/view',
    );
  });

  test('file with .suffix: recipes/$recipeId.delete.endpoint.ts', () => {
    expect(subject('recipes/$recipeId.delete.endpoint.ts')).toBe(
      'recipes/:recipeId/delete',
    );
  });

  test('multi-param: restaurant/$restaurantId/recipes/$recipeId.view/endpoint.ts', () => {
    expect(
      subject(
        'restaurant/$restaurantId/recipes/$recipeId.view/endpoint.ts',
      ),
    ).toBe('restaurant/:restaurantId/recipes/:recipeId/view');
  });

  test('non-$ segments are unchanged', () => {
    expect(subject('recipes/create.endpoint.ts')).toBe('recipes/create');
  });

  test('PascalName drops :param segments entirely', () => {
    // The path param shows up as a typed positional argument on the
    // generated SDK method, so encoding its name twice (`recipesEditRecipeId`)
    // would just be noise. We collapse to `RecipesEdit`.
    const edit = getEndpointHttpPath(
      [root],
      '',
      endpointPath('recipes/edit/$recipeId.endpoint.ts'),
    );
    expect(edit.httpPath).toBe('recipes/edit/:recipeId');
    expect(edit.httpPathPascalName).toBe('RecipesEdit');

    const view = getEndpointHttpPath(
      [root],
      '',
      endpointPath('recipes/$recipeId.view/endpoint.ts'),
    );
    expect(view.httpPath).toBe('recipes/:recipeId/view');
    expect(view.httpPathPascalName).toBe('RecipesView');

    const multi = getEndpointHttpPath(
      [root],
      '',
      endpointPath(
        'restaurant/$restaurantId/recipes/$recipeId.view/endpoint.ts',
      ),
    );
    expect(multi.httpPath).toBe(
      'restaurant/:restaurantId/recipes/:recipeId/view',
    );
    expect(multi.httpPathPascalName).toBe('RestaurantRecipesView');
  });
});
