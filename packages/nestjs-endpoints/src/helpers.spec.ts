import { ApiQuery } from '@nestjs/swagger';
import { vi } from 'vitest';
import z from 'zod';
import { ApiQueries } from './helpers';

vi.mock('@nestjs/swagger', () => ({
  ApiQuery: vi.fn(() => () => {}),
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
