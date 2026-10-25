import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import type { EndpointDescriptor } from '../../descriptors.js';
import { convertObject } from '../../object-parameters.js';
import type { JsonSchema } from '../../zod-to-openapi.js';
import {
  buildSchemasModuleSource,
  collectInputSchemas,
} from './input-schemas.js';

/** A minimal descriptor, with `json` as its input when given. */
function descriptor(
  fields: Pick<EndpointDescriptor, 'operationId'> &
    Partial<Omit<EndpointDescriptor, 'input'>> & { json?: JsonSchema },
): EndpointDescriptor {
  const { json, ...rest } = fields;
  return {
    kind: 'mutation',
    method: 'post',
    path: '/',
    pathParams: [],
    namespaceChain: [],
    tags: [],
    summary: '',
    outputs: [],
    ...(json ? { input: { json, components: {} } } : {}),
    ...rest,
  };
}

/** `collectInputSchemas` over `descriptors`, with `schemas` as the shared set. */
const collect = (
  descriptors: EndpointDescriptor[],
  schemas: Record<string, JsonSchema> = {},
) => collectInputSchemas(descriptors, { schemas, renamed: new Map() });

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

describe('collectInputSchemas', () => {
  test('a body input is the request body schema, with its $ref resolved', () => {
    const login = {
      type: 'object',
      properties: { email: { type: 'string' } },
      required: ['email'],
    };
    const entries = collect(
      [
        descriptor({
          operationId: 'AuthLogin',
          json: ref('AuthLoginInput'),
        }),
      ],
      { AuthLoginInput: login },
    );
    expect([...entries.values()]).toEqual([
      { sourceName: 'authLogin', schemas: { input: login } },
    ]);
  });

  test('nested $refs are resolved at every depth, inside properties, items, oneOf and allOf', () => {
    const address = {
      type: 'object',
      properties: { city: { type: 'string' } },
    };
    const tag = { type: 'string', enum: ['a', 'b'] };
    const named = {
      type: 'object',
      properties: { name: { type: 'string' } },
    };
    const entries = collect(
      [
        descriptor({
          operationId: 'ProfileUpdate',
          json: ref('ProfileUpdateInput'),
        }),
      ],
      {
        ProfileUpdateInput: {
          type: 'object',
          properties: {
            address: { oneOf: [ref('Address'), { type: 'null' }] },
            tags: { type: 'array', items: ref('Tag') },
            owner: { allOf: [ref('Named'), { description: 'who' }] },
          },
        },
        Address: address,
        Tag: tag,
        Named: named,
      },
    );
    const schema = entries.get('profileUpdate')!.schemas.input;
    expect(schema).toEqual({
      type: 'object',
      properties: {
        address: { oneOf: [address, { type: 'null' }] },
        tags: { type: 'array', items: tag },
        owner: { allOf: [named, { description: 'who' }] },
      },
    });
    expect(JSON.stringify(schema)).not.toContain('$ref');
  });

  test('a $ref with sibling keywords keeps them over the referenced schema', () => {
    const entries = collect(
      [
        descriptor({
          operationId: 'A',
          json: {
            type: 'object',
            properties: {
              at: { ...ref('Point'), description: 'where' },
            },
          },
        }),
      ],
      { Point: { type: 'object', description: 'a point' } },
    );
    expect(entries.get('a')!.schemas.input!.properties).toEqual({
      at: { type: 'object', description: 'where' },
    });
  });

  test('a schema referenced twice without recursion is resolved both times', () => {
    const point = {
      type: 'object',
      properties: { x: { type: 'number' } },
    };
    const entries = collect(
      [
        descriptor({
          operationId: 'A',
          json: {
            type: 'object',
            properties: { from: ref('Point'), to: ref('Point') },
          },
        }),
      ],
      { Point: point },
    );
    expect(entries.get('a')!.schemas.input!.properties).toEqual({
      from: point,
      to: point,
    });
  });

  test('a query keeps object-level keywords, beside the body', () => {
    const { schema, parameters, components } = convertObject(
      z.object({ q: z.string() }).strict().describe('Filters'),
    );
    const body = { type: 'object', properties: { n: { type: 'number' } } };
    const entries = collect(
      [
        descriptor({
          operationId: 'Search',
          kind: 'query',
          path: '/search',
          json: body,
          query: { json: schema, components, parameters },
        }),
      ],
      components,
    );
    const { schemas } = entries.get('search')!;
    expect(schemas.input).toEqual(body);
    expect(schemas.query).toMatchObject({
      type: 'object',
      description: 'Filters',
      additionalProperties: false,
      properties: { q: { type: 'string' } },
    });
  });

  test('a query with a meta id is resolved', () => {
    const { schema, parameters, components } = convertObject(
      z.object({ q: z.string() }).meta({ id: 'Filters' }),
    );
    const entries = collect(
      [
        descriptor({
          operationId: 'Search',
          kind: 'query',
          method: 'get',
          query: { json: schema, components, parameters },
        }),
      ],
      components,
    );
    expect(entries.get('search')!.schemas).toEqual({
      query: {
        type: 'object',
        properties: { q: { type: 'string' } },
        required: ['q'],
      },
    });
  });

  test('an operation with neither body nor query parameters has no entry', () => {
    const entries = collect([
      descriptor({
        operationId: 'ArticlesLatest',
        method: 'get',
        path: '/articles/latest',
      }),
      // `query: z.object({})`: no search parameters, so no query to describe.
      descriptor({
        operationId: 'Everything',
        method: 'get',
        path: '/everything',
        query: {
          json: convertObject(z.object({})).schema,
          components: {},
          parameters: [],
        },
      }),
      descriptor({
        operationId: 'RecipesDelete',
        method: 'delete',
        path: '/recipes/{id}',
        pathParams: [{ name: 'id', schema: { type: 'string' } }],
      }),
    ]);
    expect(entries.size).toBe(0);
  });

  test('a recursive schema stops with an error naming the operation', () => {
    expect(() =>
      collect(
        [descriptor({ operationId: 'TreeSave', json: ref('Node') })],
        {
          Node: {
            type: 'object',
            properties: {
              children: { type: 'array', items: ref('Node') },
            },
          },
        },
      ),
    ).toThrow(/TreeSave/);
  });

  test('a discriminator keeps its property name but not its mapping into the document', () => {
    const cat = {
      type: 'object',
      properties: { kind: { type: 'string', const: 'cat' } },
    };
    const entries = collect(
      [
        descriptor({
          operationId: 'PetsCreate',
          json: {
            oneOf: [ref('Cat')],
            discriminator: {
              propertyName: 'kind',
              mapping: { cat: '#/components/schemas/Cat' },
            },
          },
        }),
      ],
      { Cat: cat },
    );
    const schema = entries.get('petsCreate')!.schemas.input;
    expect(schema).toEqual({
      oneOf: [cat],
      discriminator: { propertyName: 'kind' },
    });
    expect(JSON.stringify(schema)).not.toContain('#/components/');
  });

  test('a property named like a keyword is a field, and its schema is resolved', () => {
    const entries = collect(
      [
        descriptor({
          operationId: 'A',
          json: {
            type: 'object',
            properties: {
              $ref: { type: 'string' },
              default: ref('B'),
            },
          },
        }),
      ],
      { B: { type: 'number' } },
    );
    expect(entries.get('a')!.schemas.input!.properties).toEqual({
      $ref: { type: 'string' },
      default: { type: 'number' },
    });
  });

  test('data keywords are copied as they are, $ref-shaped values included', () => {
    const data = { $ref: '#/components/schemas/Missing' };
    const schema = {
      type: 'object',
      default: data,
      const: data,
      enum: [data],
      examples: [data],
      example: data,
    };
    const { input } = collect([
      descriptor({ operationId: 'A', json: schema }),
    ]).get('a')!.schemas;
    expect(input).toEqual(schema);
    expect(input!.default).not.toBe(data);
  });

  test('the descriptors and shared schemas are not changed', () => {
    const descriptors = [
      descriptor({ operationId: 'A', json: ref('AInput') }),
    ];
    const schemas = {
      AInput: { type: 'object', properties: { b: ref('B') } },
      B: { type: 'string' },
    };
    const before = structuredClone({ descriptors, schemas });
    collect(descriptors, schemas).get('a')!.schemas.input!.extra = true;
    expect({ descriptors, schemas }).toEqual(before);
  });
});

describe('buildSchemasModuleSource', () => {
  const source = buildSchemasModuleSource({
    entries: [
      {
        sourceName: 'authLogin',
        schemas: {
          input: {
            type: 'object',
            properties: { email: { type: 'string' } },
          },
        },
      },
      {
        sourceName: 'greet',
        schemas: {
          input: { type: 'object' },
          query: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      },
    ],
    runtimeImport: './client-runtime',
    typesImport: './types',
  });

  test('the module source types each group with its request type and parses as TypeScript', () => {
    expect(source).toContain(
      `export const authLogin: { input: InputSchema<NonNullable<AuthLoginOptions['body']>> } =`,
    );
    expect(source).toContain(
      `export const greet: { input: InputSchema<NonNullable<GreetOptions['body']>>; query: InputSchema<NonNullable<GreetOptions['query']>> } =`,
    );
    expect(source).toContain(
      `import type { InputSchema } from './client-runtime';`,
    );
    expect(source).toContain(
      `import type { AuthLoginOptions, GreetOptions } from './types';`,
    );
    const { diagnostics } = ts.transpileModule(source, {
      reportDiagnostics: true,
    });
    expect(diagnostics).toEqual([]);
  });
});
