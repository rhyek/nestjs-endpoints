import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { InputNode } from '@kubb/ast';
import { expect, test } from 'vitest';
import { z } from 'zod';
import type { EndpointDescriptor } from '../../descriptors.js';
import { convertObject } from '../../object-parameters.js';
import { mergeSharedSchemas } from '../../shared-schemas.js';
import { toJsonSchema } from '../../zod-to-openapi.js';
import {
  adapterEndpoints,
  buildInputNode,
  schemaToNode,
} from './adapter.js';

const at = { operationId: 'Op', pointer: '#' };

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const inputDate = {
  oneOf: [
    { type: 'string', format: 'date-time' },
    { type: 'string', format: 'date' },
  ],
};

test('string with format, pattern and length', () => {
  expect(
    schemaToNode(
      { type: 'string', pattern: '^a', minLength: 1, maxLength: 5 },
      at,
    ),
  ).toEqual({
    kind: 'Schema',
    type: 'string',
    primitive: 'string',
    pattern: '^a',
    min: 1,
    max: 5,
  });
  expect(
    schemaToNode({ type: 'string', format: 'email', minLength: 3 }, at),
  ).toEqual({
    kind: 'Schema',
    type: 'email',
    primitive: 'string',
    format: 'email',
    min: 3,
  });
  expect(
    schemaToNode({ type: 'string', format: 'uri' }, at),
  ).toMatchObject({ type: 'url', format: 'uri' });
  expect(
    schemaToNode({ type: 'string', format: 'date-time' }, at),
  ).toMatchObject({ type: 'datetime', offset: false, local: false });
  expect(
    schemaToNode({ type: 'string', format: 'date' }, at),
  ).toMatchObject({ type: 'date', representation: 'string' });
  // A format Kubb has no type for stays a string and keeps its format.
  expect(
    schemaToNode({ type: 'string', format: 'cuid', pattern: '^c' }, at),
  ).toMatchObject({ type: 'string', format: 'cuid', pattern: '^c' });
});

test('a type array with null is a nullable type', () => {
  expect(schemaToNode({ type: ['string', 'null'] }, at)).toEqual({
    kind: 'Schema',
    type: 'string',
    primitive: 'string',
    nullable: true,
  });
  expect(schemaToNode({ type: ['string', 'number'] }, at)).toMatchObject({
    type: 'union',
    members: [{ type: 'string' }, { type: 'number' }],
  });
});

test('integer with bounds', () => {
  expect(
    schemaToNode(
      {
        type: 'integer',
        minimum: 0,
        maximum: 10,
        exclusiveMinimum: -1,
        multipleOf: 2,
      },
      at,
    ),
  ).toEqual({
    kind: 'Schema',
    type: 'integer',
    primitive: 'integer',
    min: 0,
    max: 10,
    exclusiveMinimum: -1,
    multipleOf: 2,
  });
  expect(
    schemaToNode({ type: 'integer', format: 'int64' }, at),
  ).toMatchObject({ type: 'integer' });
});

test('object properties carry their required and optional flags', () => {
  const node = schemaToNode(
    {
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'number' },
        c: { type: ['string', 'null'] },
      },
      required: ['a'],
      minProperties: 1,
    },
    at,
  );
  expect(node).toMatchObject({
    type: 'object',
    primitive: 'object',
    minProperties: 1,
    properties: [
      {
        kind: 'Property',
        name: 'a',
        required: true,
        schema: { type: 'string' },
      },
      {
        kind: 'Property',
        name: 'b',
        required: false,
        schema: { type: 'number', optional: true },
      },
      {
        kind: 'Property',
        name: 'c',
        required: false,
        schema: { type: 'string', nullable: true, nullish: true },
      },
    ],
  });
  expect(
    (node as { properties: { schema: object }[] }).properties[0].schema,
  ).not.toHaveProperty('optional', true);
});

test('additionalProperties and propertyNames make a record', () => {
  expect(
    schemaToNode(
      {
        type: 'object',
        propertyNames: { type: 'string', enum: ['a', 'b'] },
        additionalProperties: { type: 'number' },
      },
      at,
    ),
  ).toEqual({
    kind: 'Schema',
    type: 'object',
    primitive: 'object',
    properties: [],
    additionalProperties: {
      kind: 'Schema',
      type: 'number',
      primitive: 'number',
    },
  });
  expect(
    schemaToNode({ type: 'object', additionalProperties: {} }, at),
  ).toMatchObject({ additionalProperties: { type: 'unknown' } });
  expect(
    schemaToNode({ type: 'object', additionalProperties: false }, at),
  ).toMatchObject({ additionalProperties: false });
});

test('items make an array, prefixItems a tuple', () => {
  expect(
    schemaToNode(
      {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 3,
      },
      at,
    ),
  ).toEqual({
    kind: 'Schema',
    type: 'array',
    primitive: 'array',
    items: [{ kind: 'Schema', type: 'string', primitive: 'string' }],
    min: 1,
    max: 3,
  });
  expect(
    schemaToNode(
      {
        type: 'array',
        prefixItems: [{ type: 'string' }, { type: 'number' }],
        items: false,
        minItems: 2,
        maxItems: 2,
      },
      at,
    ),
  ).toEqual({
    kind: 'Schema',
    type: 'tuple',
    primitive: 'array',
    items: [
      { kind: 'Schema', type: 'string', primitive: 'string' },
      { kind: 'Schema', type: 'number', primitive: 'number' },
    ],
    min: 2,
    max: 2,
  });
  expect(
    schemaToNode(
      {
        type: 'array',
        prefixItems: [{ type: 'string' }],
        items: { type: 'number' },
      },
      at,
    ),
  ).toMatchObject({ type: 'tuple', rest: { type: 'number' } });
});

test('anyOf and oneOf make a union, allOf an intersection', () => {
  expect(
    schemaToNode({ anyOf: [{ type: 'string' }, { type: 'number' }] }, at),
  ).toMatchObject({
    type: 'union',
    strategy: 'any',
    members: [{ type: 'string' }, { type: 'number' }],
  });
  expect(
    schemaToNode({ oneOf: [{ type: 'string' }, { type: 'null' }] }, at),
  ).toMatchObject({
    type: 'union',
    strategy: 'one',
    members: [{ type: 'string' }, { type: 'null' }],
  });
  expect(
    schemaToNode(
      {
        allOf: [
          ref('A'),
          {
            type: 'object',
            properties: { b: { type: 'string' } },
            required: ['b'],
          },
        ],
      },
      at,
    ),
  ).toMatchObject({
    type: 'intersection',
    members: [{ type: 'ref', name: 'A' }, { type: 'object' }],
  });
});

test('enum and const', () => {
  expect(schemaToNode({ type: 'string', enum: ['a', 'b'] }, at)).toEqual({
    kind: 'Schema',
    type: 'enum',
    primitive: 'string',
    enumValues: ['a', 'b'],
  });
  expect(schemaToNode({ type: 'number', enum: [1, 2] }, at)).toMatchObject(
    {
      type: 'enum',
      primitive: 'number',
      namedEnumValues: [
        { name: '1', value: 1, primitive: 'number' },
        { name: '2', value: 2, primitive: 'number' },
      ],
    },
  );
  expect(schemaToNode({ type: 'string', const: 'a' }, at)).toEqual({
    kind: 'Schema',
    type: 'enum',
    primitive: 'string',
    enumValues: ['a'],
  });
  expect(schemaToNode({ const: null }, at)).toMatchObject({
    type: 'null',
  });
});

test('not: {} is never, {} is unknown', () => {
  expect(schemaToNode({ not: {} }, at)).toEqual({
    kind: 'Schema',
    type: 'never',
    primitive: 'never',
  });
  expect(schemaToNode({}, at)).toEqual({
    kind: 'Schema',
    type: 'unknown',
    primitive: 'unknown',
  });
  expect(() => schemaToNode({ not: { type: 'string' } }, at)).toThrow(
    /"not".*in operation "Op" at #$/,
  );
});

test('$ref is a ref node with the schema name', () => {
  expect(
    schemaToNode({ ...ref('Address'), description: 'Where' }, at),
  ).toEqual({
    kind: 'Schema',
    type: 'ref',
    name: 'Address',
    ref: '#/components/schemas/Address',
    description: 'Where',
  });
  expect(() =>
    schemaToNode({ $ref: 'https://example.com/schema' }, at),
  ).toThrow(/https:\/\/example\.com\/schema.*"Op"/);
});

test('discriminator is ignored', () => {
  const union = {
    type: 'object',
    oneOf: [
      {
        type: 'object',
        properties: { t: { type: 'string', const: 'a' } },
        required: ['t'],
      },
      {
        type: 'object',
        properties: { t: { type: 'string', const: 'b' } },
        required: ['t'],
      },
    ],
  };
  const node = schemaToNode(
    { ...union, discriminator: { propertyName: 't' } },
    at,
  );
  expect(node).toEqual(schemaToNode(union, at));
  expect(node).toMatchObject({
    type: 'union',
    discriminatorPropertyName: 't',
  });
});

test('the input date is one string, nullable when nested', () => {
  expect(schemaToNode(inputDate, at)).toEqual({
    kind: 'Schema',
    type: 'string',
    primitive: 'string',
  });
  expect(
    schemaToNode({ description: 'When', ...inputDate }, at),
  ).toMatchObject({ type: 'string', description: 'When' });
  expect(
    schemaToNode({ oneOf: [inputDate, { type: 'null' }] }, at),
  ).toMatchObject({
    type: 'union',
    members: [{ type: 'string' }, { type: 'null' }],
  });
});

test('union members of one unconstrained primitive collapse', () => {
  // Constrained strings stay apart; other members stay.
  expect(
    schemaToNode(
      {
        oneOf: [
          { type: 'string', format: 'date-time' },
          { type: 'string', format: 'date' },
          { type: 'number' },
        ],
      },
      at,
    ),
  ).toMatchObject({
    type: 'union',
    members: [{ type: 'string' }, { type: 'number' }],
  });
  expect(
    schemaToNode(
      { oneOf: [{ type: 'string', minLength: 1 }, { type: 'string' }] },
      at,
    ),
  ).toMatchObject({
    type: 'union',
    members: [{ type: 'string', min: 1 }, { type: 'string' }],
  });
});

test('annotations are carried', () => {
  expect(
    schemaToNode(
      {
        type: 'string',
        default: 'x',
        description: 'A name',
        deprecated: true,
        readOnly: true,
        examples: ['y'],
      },
      at,
    ),
  ).toEqual({
    kind: 'Schema',
    type: 'string',
    primitive: 'string',
    default: 'x',
    description: 'A name',
    deprecated: true,
    readOnly: true,
    examples: ['y'],
  });
});

test('unsupported keyword throws with operation and pointer', () => {
  expect(() =>
    schemaToNode(
      { type: 'object', properties: { x: { if: {} } } },
      { operationId: 'UserCreate', pointer: '#' },
    ),
  ).toThrow(
    'Unsupported JSON Schema keyword "if" in operation "UserCreate" at #/properties/x',
  );
  expect(() =>
    schemaToNode(
      {
        type: 'object',
        properties: { 'a/b': { patternProperties: { '^x': {} } } },
      },
      at,
    ),
  ).toThrow('"patternProperties" in operation "Op" at #/properties/a~1b');
  expect(() =>
    schemaToNode(
      { type: 'array', items: { dependentSchemas: {}, title: 'T' } },
      at,
    ),
  ).toThrow('"dependentSchemas" in operation "Op" at #/items');
});

test('annotation keywords are carried, or ignored where the AST has no field', () => {
  expect(
    schemaToNode(
      {
        type: 'string',
        title: 'Name',
        example: 'Ada',
        'x-foo': { bar: 1 },
        $comment: 'internal',
        writeOnly: true,
        contentMediaType: 'text/plain',
      },
      at,
    ),
  ).toEqual({
    kind: 'Schema',
    type: 'string',
    primitive: 'string',
    title: 'Name',
    examples: ['Ada'],
    writeOnly: true,
  });
  // `examples` wins over the singular `example`, as in an OpenAPI document.
  expect(
    schemaToNode({ type: 'number', example: 1, examples: [2] }, at),
  ).toMatchObject({ examples: [2] });
});

test('z.base64() converts despite its contentEncoding', () => {
  const { schema } = toJsonSchema(z.base64(), 'input');
  expect(schema.contentEncoding).toBe('base64');
  expect(schemaToNode(schema, at)).toMatchObject({
    type: 'string',
    format: 'base64',
    pattern: schema.pattern,
  });
});

// Descriptors built the way an endpoint's setup builds them.
function descriptorOf(
  operationId: string,
  parts: {
    kind?: EndpointDescriptor['kind'];
    method?: EndpointDescriptor['method'];
    path?: string;
    pathParams?: EndpointDescriptor['pathParams'];
    namespaceChain?: string[];
    summary?: string;
    input?: z.ZodObject;
    query?: z.ZodObject;
    params?: z.ZodObject;
    outputs?: Record<number, z.ZodType>;
  },
): EndpointDescriptor {
  const method = parts.method ?? 'post';
  let input: EndpointDescriptor['input'];
  let query: EndpointDescriptor['query'];
  if (parts.query) {
    const converted = convertObject(parts.query);
    query = {
      json: converted.schema,
      components: converted.components,
      parameters: converted.parameters,
    };
  }
  if (parts.input) {
    const c = toJsonSchema(parts.input, 'input', operationId + 'Input');
    input = { json: c.schema, components: c.components };
  }
  let params: EndpointDescriptor['params'];
  const paramSchemas = new Map<string, Record<string, unknown>>();
  if (parts.params) {
    const converted = convertObject(parts.params);
    params = { json: converted.schema, components: converted.components };
    for (const p of converted.parameters)
      paramSchemas.set(p.name, p.schema);
  }
  const pathParams =
    parts.pathParams ??
    [...(parts.path ?? '').matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
      name,
      schema: paramSchemas.get(name) ?? { type: 'string' },
    }));
  return {
    operationId,
    kind: parts.kind ?? 'mutation',
    method,
    path: parts.path ?? '/' + operationId,
    pathParams,
    ...(query ? { query } : {}),
    namespaceChain: parts.namespaceChain ?? [],
    tags: [],
    summary: parts.summary ?? '',
    ...(params ? { params } : {}),
    ...(input ? { input } : {}),
    outputs: Object.entries(parts.outputs ?? {}).map(([status, s]) => {
      const c = toJsonSchema(
        s,
        'output',
        operationId + (status === '200' ? '' : status) + 'Output',
      );
      return {
        status: Number(status),
        schema: { json: c.schema, components: c.components },
      };
    }),
  };
}

function inputNodeOf(descriptors: EndpointDescriptor[]) {
  return buildInputNode({
    descriptors,
    shared: mergeSharedSchemas(descriptors),
  });
}

function schemaNamed(input: InputNode, name: string) {
  return input.schemas.find((s) => s.name === name);
}

test('GET with path and search parameters', () => {
  const input = inputNodeOf([
    descriptorOf('RecipesView', {
      kind: 'query',
      method: 'get',
      path: '/recipes/{recipeId}/view',
      namespaceChain: ['recipes'],
      summary: 'View a recipe',
      params: z.object({ recipeId: z.number() }),
      query: z.object({
        lang: z.string(),
        page: z.number().optional(),
      }),
      outputs: { 200: z.object({ id: z.number() }) },
    }),
  ]);
  expect(input.operations).toHaveLength(1);
  const [op] = input.operations;
  expect(op).toMatchObject({
    kind: 'Operation',
    protocol: 'http',
    operationId: 'RecipesView',
    method: 'GET',
    path: '/recipes/{recipeId}/view',
    summary: 'View a recipe',
    extensions: { 'x-namespace': ['recipes'] },
    parameters: [
      {
        kind: 'Parameter',
        name: 'recipeId',
        in: 'path',
        required: true,
        schema: { type: 'number' },
      },
      {
        name: 'lang',
        in: 'query',
        required: true,
        schema: { type: 'string' },
      },
      {
        name: 'page',
        in: 'query',
        required: false,
        schema: { type: 'number', optional: true },
      },
    ],
  });
  expect(op.requestBody).toBeUndefined();
});

test('a POST takes search parameters beside its body', () => {
  const input = inputNodeOf([
    descriptorOf('ItemsSave', {
      query: z.object({ draft: z.boolean() }),
      input: z.object({ name: z.string() }),
    }),
  ]);
  const [op] = input.operations;
  expect(op).toMatchObject({
    method: 'POST',
    parameters: [{ name: 'draft', in: 'query', required: true }],
    requestBody: {
      content: [{ schema: { type: 'ref', name: 'ItemsSaveInput' } }],
    },
  });
});

test('mutation body references <operationId>Input', () => {
  const input = inputNodeOf([
    descriptorOf('UserCreate', {
      input: z.object({ name: z.string() }),
      outputs: { 200: z.object({ id: z.number() }) },
    }),
  ]);
  const [op] = input.operations;
  expect(op).toMatchObject({ method: 'POST', parameters: [] });
  expect(op).not.toHaveProperty('extensions', expect.anything());
  expect(op.summary).toBeUndefined();
  expect(op.requestBody).toMatchObject({
    kind: 'RequestBody',
    required: true,
    content: [
      {
        kind: 'Content',
        contentType: 'application/json',
        schema: {
          type: 'ref',
          name: 'UserCreateInput',
          ref: '#/components/schemas/UserCreateInput',
        },
      },
    ],
  });
  expect(schemaNamed(input, 'UserCreateInput')).toMatchObject({
    type: 'object',
    properties: [{ name: 'name', required: true }],
  });
});

test('outputs per status reference renamed ids', () => {
  const address = z
    .object({ city: z.string(), country: z.string().default('GT') })
    .meta({ id: 'Address' });
  const input = inputNodeOf([
    descriptorOf('UserAppointmentCreate', {
      input: z.object({ address }),
      outputs: {
        201: z.object({ address }),
        400: z.string(),
      },
    }),
  ]);
  const [op] = input.operations;
  expect(op.responses).toMatchObject([
    {
      kind: 'Response',
      statusCode: '201',
      content: [
        {
          contentType: 'application/json',
          schema: { type: 'ref', name: 'UserAppointmentCreate201Output' },
        },
      ],
    },
    {
      statusCode: '400',
      content: [
        {
          schema: { type: 'ref', name: 'UserAppointmentCreate400Output' },
        },
      ],
    },
  ]);
  const output = schemaNamed(input, 'UserAppointmentCreate201Output');
  expect(output).toMatchObject({
    properties: [{ name: 'address', schema: { name: 'AddressOutput' } }],
  });
  expect(schemaNamed(input, 'AddressOutput')).toMatchObject({
    properties: [
      { name: 'city', required: true },
      { name: 'country', required: true },
    ],
  });
  expect(schemaNamed(input, 'Address')).toMatchObject({
    properties: [
      { name: 'city', required: true },
      { name: 'country', required: false },
    ],
  });
});

test('no outputs → body-less default response', () => {
  const input = inputNodeOf([
    descriptorOf('UserPurge', { method: 'post' }),
    descriptorOf('TestStatus', { method: 'get' }),
    descriptorOf('UserRemove', { method: 'delete' }),
  ]);
  const [purge, status, remove] = input.operations;
  const bodyLess = (statusCode: string) => [
    {
      kind: 'Response',
      statusCode,
      content: [
        {
          kind: 'Content',
          contentType: 'application/json',
          schema: { type: 'unknown' },
        },
      ],
    },
  ];
  expect(purge.responses).toMatchObject(bodyLess('200'));
  expect(status.responses).toMatchObject(bodyLess('200'));
  expect(remove.responses).toMatchObject(bodyLess('200'));
});

test('only reachable shared schemas are included', () => {
  const used = z.object({ a: z.string() }).meta({ id: 'Used' });
  const nested = z.object({ n: z.number() }).meta({ id: 'Nested' });
  const viaParam = z.string().meta({ id: 'Slug' });
  const unused = z.object({ b: z.string() }).meta({ id: 'Unused' });
  const ops = [
    descriptorOf('A', {
      input: z.object({ used }),
      outputs: { 200: z.object({ deep: z.object({ nested }) }) },
    }),
    descriptorOf('B', {
      method: 'get',
      path: '/b/{slug}',
      params: z.object({ slug: viaParam }),
      query: z.object({ q: z.string() }).meta({ id: 'BFilters' }),
    }),
    descriptorOf('C', { input: z.object({ unused }) }),
  ];
  const shared = mergeSharedSchemas(ops);
  const input = buildInputNode({ descriptors: ops.slice(0, 2), shared });
  expect(input.schemas.map((s) => s.name).sort()).toEqual([
    'AInput',
    'AOutput',
    'BFilters',
    'Nested',
    'Slug',
    'Used',
  ]);
  // A ref to a named schema carries the schema it resolves to.
  const aInput = schemaNamed(input, 'AInput') as {
    properties: { schema: unknown }[];
  };
  expect(aInput.properties[0].schema).toMatchObject({
    type: 'ref',
    name: 'Used',
    schema: { type: 'object' },
  });
});

test('a self-referencing schema is circular', () => {
  const input = inputNodeOf([
    descriptorOf('Tree', {
      outputs: { 200: z.object({ value: z.json() }) },
    }),
  ]);
  expect(input.meta.circularNames.length).toBeGreaterThan(0);
});

test('an unknown keyword in a shared schema names an operation using it', () => {
  const ops = [descriptorOf('UserCreate', {})];
  expect(() =>
    buildInputNode({
      descriptors: [
        {
          ...ops[0],
          input: {
            json: ref('UserCreateInput'),
            components: {},
          },
        },
      ],
      shared: {
        schemas: {
          UserCreateInput: {
            type: 'object',
            properties: { a: { foo: 1 } },
          },
        },
        renamed: new Map(),
      },
    }),
  ).toThrow(
    '"foo" in operation "UserCreate" at #/components/schemas/UserCreateInput/properties/a',
  );
});

/**
 * Runs Kubb with the adapter, plugin-ts and plugin-client; returns each
 * file by its name, the clients under `clients/`.
 */
async function printTypes(
  input: InputNode,
): Promise<Record<string, string>> {
  const dir = await mkdtemp(
    path.join(os.tmpdir(), 'nestjs-endpoints-adapter-'),
  );
  try {
    const [{ createKubb }, kit, { pluginTs }, { pluginClient }] =
      await Promise.all([
        import('kubb'),
        import('kubb/kit'),
        import('@kubb/plugin-ts'),
        import('@kubb/plugin-client'),
      ]);
    const outDir = path.join(dir, 'out');
    const build = createKubb({
      root: dir,
      input: {},
      adapter: adapterEndpoints(kit, input),
      output: {
        path: outDir,
        clean: true,
        barrel: false,
        format: false,
        lint: false,
      },
      plugins: [
        pluginTs(),
        pluginClient({ importPath: '../client-runtime' }),
      ],
    });
    try {
      await build.build();
    } finally {
      build.dispose();
    }
    const files: Record<string, string> = {};
    for (const [subdir, prefix] of [
      ['types', ''],
      ['clients', 'clients/'],
    ]) {
      for (const file of await readdir(path.join(outDir, subdir))) {
        files[prefix + file] = await readFile(
          path.join(outDir, subdir, file),
          'utf8',
        );
      }
    }
    return files;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const banner = `/**
* Generated by Kubb (https://kubb.dev/).
* Do not edit manually.
*/
`;

test(
  'Kubb prints the types and clients from the AST',
  { timeout: 60_000 },
  async () => {
    const profile = z.object({
      name: z.string().trim().min(1),
      nickname: z.string().nullish(),
      theme: z.enum(['light', 'dark', 'system']).default('system'),
      address: z
        .object({ street: z.string(), city: z.string() })
        .meta({ id: 'ProfileAddress' })
        .nullable(),
      tags: z.array(z.string()).default([]),
    });
    const files = await printTypes(
      inputNodeOf([
        descriptorOf('ProfileUpdate', {
          input: profile,
          outputs: { 200: profile },
        }),
        descriptorOf('UserFind', {
          kind: 'query',
          method: 'get',
          query: z.object({ id: z.number(), at: z.date().optional() }),
          outputs: {
            200: z.object({
              id: z.int(),
              name: z.string(),
              nickname: z.string().meta({ example: 'Ada' }),
            }),
          },
        }),
        descriptorOf('RecipesView', {
          method: 'get',
          path: '/recipes/{recipeId}/view',
          params: z.object({ recipeId: z.number() }),
        }),
        descriptorOf('UserAppointmentCreate', {
          path: '/user/appointment/create',
          summary: 'Create an appointment',
          input: z.object({
            date: z.coerce.date(),
            until: z.date().nullable(),
          }),
          outputs: {
            201: z.object({ date: z.date() }),
            400: z.union([
              z.string(),
              z.object({ message: z.string(), errorCode: z.string() }),
            ]),
          },
        }),
      ]),
    );

    // As printed from today's OpenAPI document.
    expect(files['ProfileUpdateInput.ts']).toBe(`${banner}
import type { ProfileAddress } from './ProfileAddress'

export const profileUpdateInputThemeEnum = {
    light: "light",
    dark: "dark",
    system: "system"
} as const;

export type ProfileUpdateInputThemeEnumKey = (typeof profileUpdateInputThemeEnum)[keyof typeof profileUpdateInputThemeEnum];

export type ProfileUpdateInput = {
    /**
     * @minLength 1
     * @type string
    */
    name: string;
    nickname?: (string | null);
    /**
     * @default 'system'
     * @type string | undefined
    */
    theme?: ProfileUpdateInputThemeEnumKey;
    address: (ProfileAddress | null);
    /**
     * @default []
     * @type array | undefined
    */
    tags?: string[];
};
`);
    expect(files['ProfileAddress.ts']).toBe(`${banner}
export type ProfileAddress = {
    street: string;
    city: string;
};
`);
    expect(files['ProfileUpdate.ts']).toBe(`${banner}
import type { ProfileUpdateInput } from './ProfileUpdateInput'
import type { ProfileUpdateOutput } from './ProfileUpdateOutput'

export type ProfileUpdateStatus200 = ProfileUpdateOutput;

export type ProfileUpdateBody = ProfileUpdateInput;

export type ProfileUpdateOptions = {
    body: ProfileUpdateBody;
    path?: never;
    query?: never;
    headers?: never;
};

export type ProfileUpdateResponses = {
    "200": ProfileUpdateStatus200;
};

/**
 * @description Union of all possible responses
*/
export type ProfileUpdateResponse = ProfileUpdateStatus200;
`);
    expect(files['UserFind.ts']).toContain(`export type UserFindQuery = {
    id: number;
    at?: string;
};`);
    // Integers print as `number`, as JSON carries them.
    expect(files['UserFindOutput.ts']).toContain(`id: number;`);
    // A `.meta({ example })` field prints the type it would without it.
    expect(files['UserFindOutput.ts']).toMatch(
      /\n {4}name: string;\n[\s\S]*\n {4}nickname: string;\n/,
    );
    expect(files['RecipesView.ts'])
      .toContain(`export type RecipesViewPath = {
    recipeId: number;
};`);
    expect(files['RecipesView.ts']).toContain(
      `export type RecipesViewStatus200 = unknown;`,
    );
    // The input date is `string` either way, and `string | null` when
    // nullable; the output date is a date-time string.
    expect(files['UserAppointmentCreateInput.ts']).toContain(
      `export type UserAppointmentCreateInput = {
    date: string;
    until: (string | null);
};`,
    );
    expect(files['UserAppointmentCreate201Output.ts']).toContain(
      `date: string;`,
    );
    expect(files['UserAppointmentCreate400Output.ts']).toContain(
      `export type UserAppointmentCreate400Output = (string | {
    message: string;
    errorCode: string;
});`,
    );
    // The request functions, as printed from today's document.
    expect(files['clients/userAppointmentCreate.ts']).toBe(`${banner}
import type { Options, RequestResult } from '../client-runtime'
import type { UserAppointmentCreateOptions, UserAppointmentCreateResponses } from '../types/UserAppointmentCreate'
import { client } from '../client-runtime'

/**
 * @summary Create an appointment
 * {@link /user/appointment/create}
 */
export function userAppointmentCreate<ThrowOnError extends boolean = true>(options: Options<UserAppointmentCreateOptions, ThrowOnError>): Promise<RequestResult<UserAppointmentCreateResponses, ThrowOnError>> {
  const { client: request = client, ...config } = options

  return request({ method: 'POST', url: '/user/appointment/create', ...config, throwOnError: config.throwOnError ?? true }) as Promise<RequestResult<UserAppointmentCreateResponses, ThrowOnError>>
}
`);
    expect(files['clients/recipesView.ts']).toContain(`/**
 * {@link /recipes/:recipeId/view}
 */
export function recipesView<ThrowOnError extends boolean = true>(options: Options<RecipesViewOptions, ThrowOnError>): Promise<RequestResult<RecipesViewResponses, ThrowOnError>> {
  const { client: request = client, ...config } = options

  return request({ method: 'GET', url: '/recipes/{recipeId}/view', ...config, throwOnError: config.throwOnError ?? true }) as Promise<RequestResult<RecipesViewResponses, ThrowOnError>>
}`);
  },
);

test('a body omits readOnly keys, a response writeOnly ones', () => {
  const [op] = inputNodeOf([
    descriptorOf('UserCreate', {
      input: z.object({
        id: z.number().readonly(),
        name: z.string(),
      }),
      outputs: {
        200: z.object({
          id: z.number(),
          password: z.string().meta({ writeOnly: true }),
        }),
      },
    }),
  ]).operations;
  expect(op.requestBody?.content?.[0].keysToOmit).toEqual(['id']);
  expect(op.responses[0].content?.[0].keysToOmit).toEqual(['password']);
});

test('oneOf and anyOf together make one union of both', () => {
  expect(
    schemaToNode(
      {
        oneOf: [{ type: 'string' }],
        anyOf: [{ type: 'number' }, { type: 'boolean' }],
      },
      at,
    ),
  ).toMatchObject({
    type: 'union',
    strategy: 'one',
    members: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
  });
  expect(() =>
    schemaToNode({ oneOf: [{ type: 'string' }], anyOf: [{ if: {} }] }, at),
  ).toThrow('"if" in operation "Op" at #/anyOf/0');
});

test('a typeless schema maps its constraints, or throws', () => {
  expect(schemaToNode({ minLength: 1 }, at)).toMatchObject({
    type: 'string',
    min: 1,
  });
  expect(schemaToNode({ pattern: '^a' }, at)).toMatchObject({
    type: 'string',
    pattern: '^a',
  });
  expect(schemaToNode({ maximum: 3 }, at)).toMatchObject({
    type: 'number',
    max: 3,
  });
  for (const keyword of [
    'multipleOf',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'minItems',
    'maxItems',
    'minProperties',
    'maxProperties',
  ]) {
    expect(() =>
      schemaToNode(
        { type: 'object', properties: { x: { [keyword]: 1 } } },
        at,
      ),
    ).toThrow(
      `"${keyword}" needs a "type" in operation "Op" at #/properties/x`,
    );
  }
});

test('a whole body that is a shared id names its enums after the body', async () => {
  const user = z
    .object({
      id: z.number().readonly(),
      role: z.enum(['a', 'b']),
    })
    .meta({ id: 'User' });
  const input = inputNodeOf([
    descriptorOf('GetUser', { method: 'get', outputs: { 200: user } }),
    descriptorOf('PutUser', { method: 'put', input: user }),
  ]);
  // The body sees the shared schema's properties, so `readOnly` ones are
  // still omitted.
  const put = input.operations.find((o) => o.operationId === 'PutUser')!;
  expect(put.requestBody?.content?.[0].keysToOmit).toEqual(['id']);
  const files = await printTypes(input);
  expect(files['GetUserOutput.ts']).toContain(
    'export const getUserOutputRoleEnum',
  );
  // `User` differs between directions only by the `additionalProperties:
  // false` zod adds to outputs, so it has no `UserOutput` twin.
  expect(files['UserOutput.ts']).toBeUndefined();
  expect(files['PutUserInput.ts']).toContain(
    'export const putUserInputRoleEnum',
  );
  expect(files['User.ts']).toContain('export const userRoleEnum');
  expect(files['PutUserInput.ts']).toContain(`export type PutUserInput = {
    readonly id: number;
    role: PutUserInputRoleEnumKey;
};`);
}, 60_000);
