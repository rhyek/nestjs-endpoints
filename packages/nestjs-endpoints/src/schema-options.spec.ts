import { z } from 'zod';
import { outputsOf, type OutputSchemaUnion } from './schema-options';

const fail = (message: string) => new Error(message);

/** The statuses and descriptions of an `output`. */
const read = (output: unknown) =>
  outputsOf(output as OutputSchemaUnion, fail)?.map(({ status, description }) => ({
    status,
    description,
  }));

describe("an endpoint's output schemas, by status", () => {
  test('are none without `output`', () => {
    expect(outputsOf(undefined, fail)).toBeUndefined();
  });

  test('are the 200 one for a single schema, with its description', () => {
    const schema = z.object({ id: z.string() }).meta({ description: 'The recipe' });
    expect(outputsOf(schema, fail)).toEqual([{ status: 200, schema, description: 'The recipe' }]);
  });

  test("are each of a map by status, with each one's description", () => {
    const found = z.object({ id: z.string() }).meta({ description: 'Found' });
    const missing = z.object({ reason: z.string() });
    expect(outputsOf({ 200: found, 404: missing }, fail)).toEqual([
      { status: 200, schema: found, description: 'Found' },
      { status: 404, schema: missing, description: undefined },
    ]);
  });

  test('are each of a map by status with no prototype', () => {
    const byStatus = Object.assign(Object.create(null) as Record<number, z.ZodType>, {
      200: z.string().meta({ description: 'Found' }),
      404: z.string(),
    });
    expect(read(byStatus)).toEqual([
      { status: 200, description: 'Found' },
      { status: 404, description: undefined },
    ]);
  });

  test("are the 200 one for a schema of another copy of zod, which no class of this one's made", () => {
    // As zod tells its schemas: by what each is, not by the class that made it.
    class OtherCopy {
      readonly _zod = { traits: new Set(['$ZodType']) };
      readonly description = 'Elsewhere';
    }
    expect(read(new OtherCopy())).toEqual([{ status: 200, description: 'Elsewhere' }]);
  });

  test('fail for a key that is no status code', () => {
    expect(() => outputsOf({ 200: z.string(), ok: z.string() } as never, fail)).toThrow(
      '`output` must be a Zod schema, or an object of them by status code: `ok` is not one.',
    );
  });
});
