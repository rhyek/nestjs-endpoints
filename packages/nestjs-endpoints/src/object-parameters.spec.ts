import z from 'zod';
import { objectParameters } from './object-parameters.js';

describe('objectParameters', () => {
  test('objectParameters splits one conversion', () => {
    const parameters = objectParameters(
      z.object({
        a: z.string(),
        b: z.coerce.number().optional(),
        d: z.coerce.date(),
      }),
    );
    expect(parameters.map((p) => p.name)).toEqual(['a', 'b', 'd']);
    expect(parameters.map((p) => p.required)).toEqual([true, false, true]);
    expect(parameters[2].schema).toEqual({
      oneOf: [
        { type: 'string', format: 'date-time' },
        { type: 'string', format: 'date' },
      ],
    });
  });

  test('objectParameters unwraps preprocess', () => {
    const parameters = objectParameters(z.preprocess((v) => v, z.object({ a: z.coerce.number() })));
    expect(parameters).toHaveLength(1);
    expect(parameters[0]).toMatchObject({ name: 'a', required: true });
  });
});
