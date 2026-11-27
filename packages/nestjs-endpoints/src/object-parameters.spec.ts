import z from 'zod';
import { convertObject, loneValuesAsArrays, type ObjectParameter } from './object-parameters';

describe('convertObject', () => {
  test('splits one conversion', () => {
    const { parameters } = convertObject(
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

  test('unwraps preprocess', () => {
    const { parameters } = convertObject(
      z.preprocess((v) => v, z.object({ a: z.coerce.number() })),
    );
    expect(parameters).toHaveLength(1);
    expect(parameters[0]).toMatchObject({ name: 'a', required: true });
  });

  test('unwraps a transform: the object it transforms', () => {
    const { json, parameters } = convertObject(
      z.object({ a: z.string(), b: z.coerce.number().optional() }).transform((v) => v.a),
    );
    expect(json).toMatchObject({ type: 'object', required: ['a'] });
    expect(parameters.map(({ name, required }) => [name, required])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });

  test('unwraps a pipe into another object: the object it reads', () => {
    const { parameters } = convertObject(
      z.object({ a: z.string() }).pipe(z.object({ a: z.string(), b: z.string().optional() })),
    );
    expect(parameters.map(({ name }) => name)).toEqual(['a']);
  });

  test('unwraps a named preprocess to its object, which is converted as it is', () => {
    const { json, parameters, components } = convertObject(
      z.preprocess((v) => v, z.object({ a: z.string() })).meta({ id: 'NamedPreprocess' }),
    );
    expect(json).toMatchObject({ type: 'object', properties: { a: { type: 'string' } } });
    expect(components).toEqual({});
    expect(parameters.map(({ name }) => name)).toEqual(['a']);
  });
});

describe('parameter shapes', () => {
  test('arrays and objects, nullable or named, are told apart from single values', () => {
    const named = z.object({ x: z.string() }).meta({ id: 'ShapeNamed' });
    const { parameters } = convertObject(
      z.object({
        tags: z.array(z.string()),
        maybeTags: z.array(z.string()).nullable().optional(),
        add: z.object({ a: z.coerce.number() }),
        ref: named,
        date: z.coerce.date(),
        either: z.union([z.string(), z.array(z.string())]),
        q: z.string(),
      }),
    );
    expect(Object.fromEntries(parameters.map((p) => [p.name, p.shape]))).toEqual({
      tags: 'array',
      maybeTags: 'array',
      add: 'object',
      ref: 'object',
      date: 'value',
      either: 'value',
      q: 'value',
    });
  });
});

describe('loneValuesAsArrays', () => {
  const parameter = (name: string, shape: ObjectParameter['shape']): ObjectParameter => ({
    name,
    required: false,
    schema: {},
    shape,
  });

  test('a query without array parameters is read as it comes', () => {
    expect(loneValuesAsArrays([parameter('q', 'value'), parameter('add', 'object')])).toBeNull();
  });

  test('a lone value of an array parameter becomes a one-item array', () => {
    const read = loneValuesAsArrays([parameter('tags', 'array'), parameter('q', 'value')])!;
    expect(read({ tags: 'a', q: 'x' })).toEqual({ tags: ['a'], q: 'x' });
  });

  test('arrays and missing parameters are left as they are', () => {
    const read = loneValuesAsArrays([parameter('tags', 'array')])!;
    const query = { tags: ['a', 'b'] };
    expect(read(query)).toBe(query);
    expect(read({})).toEqual({});
    expect(read(undefined)).toBeUndefined();
  });
});
