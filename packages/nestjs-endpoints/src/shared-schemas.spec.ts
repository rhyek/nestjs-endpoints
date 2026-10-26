import { expect, test } from 'vitest';
import * as z from 'zod';
import type { EndpointDescriptor } from './descriptors.js';
import { mergeSharedSchemas, reachableSchemas, rewriteOutputRefs } from './shared-schemas.js';
import { toJsonSchema } from './zod-to-openapi.js';

function descriptor(
  operationId: string,
  parts: {
    input?: z.ZodType;
    params?: z.ZodType;
    query?: z.ZodType;
    output?: z.ZodType;
  },
): EndpointDescriptor {
  const conv = (s: z.ZodType, io: 'input' | 'output', ref: string) => {
    const c = toJsonSchema(s, io, ref);
    return { json: c.schema, components: c.components };
  };
  const params = parts.params && toJsonSchema(parts.params, 'input');
  const query = parts.query && toJsonSchema(parts.query, 'input');
  return {
    operationId,
    kind: 'mutation',
    method: 'post',
    path: '/' + operationId,
    pathParams: [],
    namespaceChain: [],
    tags: [],
    summary: operationId,
    ...(params ? { params: { json: params.schema, components: params.components } } : {}),
    ...(query
      ? {
          query: {
            json: query.schema,
            components: query.components,
            parameters: [],
          },
        }
      : {}),
    ...(parts.input ? { input: conv(parts.input, 'input', operationId + 'Input') } : {}),
    outputs: parts.output
      ? [
          {
            status: 200,
            schema: conv(parts.output, 'output', operationId + 'Output'),
          },
        ]
      : [],
  };
}

const address = (extra: Record<string, z.ZodType> = {}) =>
  z
    .object({
      city: z.string(),
      country: z.string().default('GT'),
      ...extra,
    })
    .meta({ id: 'Address' });

test('equal conversions are one schema', () => {
  const plain = z.enum(['a', 'b']).meta({ id: 'Place' });
  const shared = mergeSharedSchemas([
    descriptor('a', { input: z.object({ p: plain }) }),
    descriptor('b', { output: z.object({ p: plain }) }),
  ]);
  expect(shared.renamed.size).toBe(0);
  expect(shared.schemas.Place).toBeDefined();
  expect(shared.schemas.PlaceOutput).toBeUndefined();
});

test('input and output differences get an Output twin', () => {
  const shared = mergeSharedSchemas([
    descriptor('a', { input: z.object({ address: address() }) }),
    descriptor('b', {
      output: z.object({ address: address() }),
    }),
  ]);
  expect(shared.renamed.get('Address')).toBe('AddressOutput');
  expect(shared.schemas.Address.required).toEqual(['city']);
  expect(shared.schemas.AddressOutput.required).toEqual(['city', 'country']);
  const bOutput = shared.schemas.bOutput as any;
  expect(bOutput.properties.address.$ref).toBe('#/components/schemas/AddressOutput');
});

test('a schema referring to a renamed id gets a twin too', () => {
  const person = z.object({ home: address() }).meta({ id: 'Person' });
  const shared = mergeSharedSchemas([
    descriptor('a', { input: z.object({ person }) }),
    descriptor('b', { output: z.object({ person }) }),
  ]);
  expect(shared.renamed.get('Person')).toBe('PersonOutput');
  expect((shared.schemas.PersonOutput as any).properties.home.$ref).toBe(
    '#/components/schemas/AddressOutput',
  );
  expect((shared.schemas.Person as any).properties.home.$ref).toBe('#/components/schemas/Address');
});

test('additionalProperties: false alone makes no twin', () => {
  // Same id and shape; only the output conversion closes the objects.
  const box = z.object({ a: z.string(), inner: z.object({ b: z.number() }) }).meta({ id: 'Box' });
  const shared = mergeSharedSchemas([
    descriptor('a', { input: z.object({ box }) }),
    descriptor('b', { output: z.object({ box }) }),
  ]);
  expect(shared.renamed.size).toBe(0);
  expect(shared.schemas.BoxOutput).toBeUndefined();
  // The one schema is the input conversion: open at every level.
  expect(shared.schemas.Box.additionalProperties).toBeUndefined();
  expect((shared.schemas.Box as any).properties.inner.additionalProperties).toBeUndefined();
  expect((shared.schemas.bOutput as any).properties.box.$ref).toBe('#/components/schemas/Box');
});

test('a strict id stays closed', () => {
  const box = z.strictObject({ a: z.string() }).meta({ id: 'Box' });
  const shared = mergeSharedSchemas([
    descriptor('a', { input: z.object({ box }) }),
    descriptor('b', { output: z.object({ box }) }),
  ]);
  expect(shared.renamed.size).toBe(0);
  expect(shared.schemas.Box.additionalProperties).toBe(false);
});

test('a real difference still makes a twin when the objects are closed', () => {
  const shared = mergeSharedSchemas([
    descriptor('a', { input: z.object({ address: address() }) }),
    descriptor('b', { output: z.object({ address: address() }) }),
  ]);
  expect(shared.renamed.get('Address')).toBe('AddressOutput');
  expect(shared.schemas.AddressOutput.additionalProperties).toBe(false);
});

test('two schemas under one id in one direction throw', () => {
  const one = z.object({ a: z.string() }).meta({ id: 'Clash' });
  const two = z.object({ b: z.number() }).meta({ id: 'Clash' });
  expect(() =>
    mergeSharedSchemas([
      descriptor('first', { input: z.object({ x: one }) }),
      descriptor('second', { input: z.object({ x: two }) }),
    ]),
  ).toThrow(/"Clash".*"first".*"second"/);
});

test('rewriteOutputRefs returns a copy and leaves the input alone', () => {
  const value = {
    a: [{ $ref: '#/components/schemas/X' }],
    b: { $ref: '#/components/schemas/Y' },
  };
  const copy = rewriteOutputRefs(value, new Map([['X', 'XOutput']]));
  expect(copy.a[0].$ref).toBe('#/components/schemas/XOutput');
  expect(copy.b.$ref).toBe('#/components/schemas/Y');
  expect(value.a[0].$ref).toBe('#/components/schemas/X');
});

test('reachableSchemas follows refs transitively', () => {
  const inner = z.object({ n: z.string() }).meta({ id: 'Inner' });
  const mid = z.object({ inner }).meta({ id: 'Mid' });
  const unused = z.object({ u: z.string() }).meta({ id: 'Unused' });
  const d = descriptor('a', {
    input: z.object({ mid }),
    output: z.object({ unused }),
  });
  const shared = mergeSharedSchemas([d]);
  const reached = reachableSchemas([d.input!.json], shared);
  expect(Object.keys(reached).sort()).toEqual(['Inner', 'Mid', 'aInput']);
});

test('params components are input-direction', () => {
  const slug = z.string().min(2).meta({ id: 'Slug' });
  const shared = mergeSharedSchemas([descriptor('a', { params: z.object({ slug }) })]);
  expect(shared.schemas.Slug).toBeDefined();
  expect(() =>
    mergeSharedSchemas([
      descriptor('a', { params: z.object({ slug }) }),
      descriptor('b', {
        params: z.object({
          slug: z.string().min(3).meta({ id: 'Slug' }),
        }),
      }),
    ]),
  ).toThrow(/"Slug".*"a".*"b"/);
});

test('query components are input-direction', () => {
  const slug = z.string().min(2).meta({ id: 'Slug' });
  expect(() =>
    mergeSharedSchemas([
      descriptor('a', { query: z.object({ slug }) }),
      descriptor('b', {
        input: z.object({
          slug: z.string().min(3).meta({ id: 'Slug' }),
        }),
      }),
    ]),
  ).toThrow(/two different input schemas: used by "a" and by "b"/);
});

test('an Output twin may not take the name of another schema', () => {
  const other = z.object({ other: z.number() }).meta({ id: 'AddressOutput' });
  expect(() =>
    mergeSharedSchemas([
      descriptor('a', { input: z.object({ address: address() }) }),
      descriptor('b', {
        output: z.object({ address: address(), other }),
      }),
    ]),
  ).toThrow(/"Address".*"AddressOutput"/);
});

test('an Output twin may not take the name of an operation output', () => {
  // `b` differs between input and output, so its output is `bOutput`,
  // which is operation `b`'s own output schema.
  const shared = z.object({ n: z.number().default(1) }).meta({ id: 'b' });
  expect(() =>
    mergeSharedSchemas([
      descriptor('a', { input: z.object({ s: shared }) }),
      descriptor('b', { output: z.object({ s: shared }) }),
    ]),
  ).toThrow(
    'Schema id "b" differs between input and output, so its output ' +
      'schema is named "bOutput", which is already the id of another schema.',
  );
});

test('input schemas come first, then outputs and twins', () => {
  const place = z.enum(['x', 'y']).meta({ id: 'Place' });
  const shared = mergeSharedSchemas([
    descriptor('b', { output: z.object({ address: address(), place }) }),
    descriptor('a', { input: z.object({ address: address(), place }) }),
  ]);
  expect(Object.keys(shared.schemas)).toEqual([
    'aInput',
    'Address',
    'Place',
    'bOutput',
    'AddressOutput',
  ]);
});
