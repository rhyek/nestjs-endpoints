import type { OpenAPIObject } from '@nestjs/swagger';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import {
  buildSchemasModuleSource,
  collectInputSchemas,
} from './input-schemas.js';

/** Build a minimal OpenAPI document from `paths` and component `schemas`. */
function doc(
  paths: Record<string, unknown>,
  schemas: Record<string, unknown> = {},
): OpenAPIObject {
  return {
    openapi: '3.1.1',
    info: { title: 't', version: '1' },
    paths,
    components: { schemas },
  } as unknown as OpenAPIObject;
}

const jsonBody = (schema: unknown) => ({
  content: { 'application/json': { schema } },
});

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

describe('collectInputSchemas', () => {
  test('a body input is the request body schema, with its $ref resolved', () => {
    const login = {
      type: 'object',
      properties: { email: { type: 'string' } },
      required: ['email'],
    };
    const entries = collectInputSchemas(
      doc(
        {
          '/auth/login': {
            post: {
              operationId: 'AuthLogin',
              requestBody: jsonBody(ref('AuthLoginInput')),
            },
          },
        },
        { AuthLoginInput: login },
      ),
    );
    expect([...entries.values()]).toEqual([
      { sourceName: 'authLogin', kind: 'body', schema: login },
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
    const document = doc(
      {
        '/profile/update': {
          post: {
            operationId: 'ProfileUpdate',
            requestBody: jsonBody(ref('ProfileUpdateInput')),
          },
        },
      },
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
    const { schema } = collectInputSchemas(document).get('profileUpdate')!;
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
    const document = doc(
      {
        '/a': {
          post: {
            operationId: 'A',
            requestBody: jsonBody({
              type: 'object',
              properties: {
                at: { ...ref('Point'), description: 'where' },
              },
            }),
          },
        },
      },
      { Point: { type: 'object', description: 'a point' } },
    );
    expect(
      collectInputSchemas(document).get('a')!.schema.properties,
    ).toEqual({ at: { type: 'object', description: 'where' } });
  });

  test('a schema referenced twice without recursion is resolved both times', () => {
    const point = {
      type: 'object',
      properties: { x: { type: 'number' } },
    };
    const document = doc(
      {
        '/a': {
          post: {
            operationId: 'A',
            requestBody: jsonBody({
              type: 'object',
              properties: { from: ref('Point'), to: ref('Point') },
            }),
          },
        },
      },
      { Point: point },
    );
    expect(
      collectInputSchemas(document).get('a')!.schema.properties,
    ).toEqual({ from: point, to: point });
  });

  test('a GET input is an object built from its query parameters', () => {
    const document = doc({
      '/greet/{id}': {
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        get: {
          operationId: 'Greet',
          parameters: [
            {
              name: 'name',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'page',
              in: 'query',
              required: false,
              schema: { type: 'number', default: 1 },
            },
            { name: 'x-trace', in: 'header', schema: { type: 'string' } },
          ],
        },
      },
    });
    expect(collectInputSchemas(document).get('greet')).toEqual({
      sourceName: 'greet',
      kind: 'query',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          page: { type: 'number', default: 1 },
        },
        required: ['name'],
      },
    });
  });

  test('a query parameter keeps its description, and its $refs are resolved', () => {
    const document = doc(
      {
        '/list': {
          get: {
            operationId: 'List',
            parameters: [
              { $ref: '#/components/parameters/Sort' },
              {
                name: 'filter',
                in: 'query',
                description: 'what to keep',
                schema: ref('Filter'),
              },
            ],
          },
        },
      },
      { Filter: { type: 'string', enum: ['all', 'mine'] } },
    );
    (document.components as Record<string, unknown>).parameters = {
      Sort: { name: 'sort', in: 'query', schema: { type: 'string' } },
    };
    expect(collectInputSchemas(document).get('list')!.schema).toEqual({
      type: 'object',
      properties: {
        sort: { type: 'string' },
        filter: {
          type: 'string',
          enum: ['all', 'mine'],
          description: 'what to keep',
        },
      },
    });
  });

  test("an operation's query parameter replaces the path item's of the same name", () => {
    const document = doc({
      '/list': {
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'string' } },
          { name: 'size', in: 'query', schema: { type: 'number' } },
        ],
        get: {
          operationId: 'List',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'number' } },
          ],
        },
      },
    });
    expect(collectInputSchemas(document).get('list')!.schema).toEqual({
      type: 'object',
      properties: { page: { type: 'number' }, size: { type: 'number' } },
    });
  });

  test('an operation with neither body nor query parameters has no entry', () => {
    const document = doc({
      '/articles/latest': { get: { operationId: 'ArticlesLatest' } },
      '/recipes/{id}': {
        delete: {
          operationId: 'RecipesDelete',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
        },
      },
    });
    expect(collectInputSchemas(document).size).toBe(0);
  });

  test('a recursive schema stops with an error naming the operation', () => {
    const document = doc(
      {
        '/tree': {
          post: {
            operationId: 'TreeSave',
            requestBody: jsonBody(ref('Node')),
          },
        },
      },
      {
        Node: {
          type: 'object',
          properties: { children: { type: 'array', items: ref('Node') } },
        },
      },
    );
    expect(() => collectInputSchemas(document)).toThrow(/TreeSave/);
  });

  test('a discriminator keeps its property name but not its mapping into the document', () => {
    const cat = {
      type: 'object',
      properties: { kind: { type: 'string', const: 'cat' } },
    };
    const document = doc(
      {
        '/pets': {
          post: {
            operationId: 'PetsCreate',
            requestBody: jsonBody({
              oneOf: [ref('Cat')],
              discriminator: {
                propertyName: 'kind',
                mapping: { cat: '#/components/schemas/Cat' },
              },
            }),
          },
        },
      },
      { Cat: cat },
    );
    const { schema } = collectInputSchemas(document).get('petsCreate')!;
    expect(schema).toEqual({
      oneOf: [cat],
      discriminator: { propertyName: 'kind' },
    });
    expect(JSON.stringify(schema)).not.toContain('#/components/');
  });

  test('a body that is not JSON is not input, even beside query parameters', () => {
    const document = doc({
      '/upload': {
        post: {
          operationId: 'Upload',
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'multipart/form-data': { schema: { type: 'object' } },
            },
          },
        },
      },
    });
    expect(collectInputSchemas(document).size).toBe(0);
  });

  test('the document is not changed', () => {
    const document = doc(
      {
        '/a': {
          post: { operationId: 'A', requestBody: jsonBody(ref('AInput')) },
        },
      },
      {
        AInput: { type: 'object', properties: { b: ref('B') } },
        B: { type: 'string' },
      },
    );
    const before = structuredClone(document);
    collectInputSchemas(document).get('a')!.schema.extra = true;
    expect(document).toEqual(before);
  });
});

describe('buildSchemasModuleSource', () => {
  const source = buildSchemasModuleSource({
    entries: [
      {
        sourceName: 'authLogin',
        kind: 'body',
        schema: {
          type: 'object',
          properties: { email: { type: 'string' } },
        },
      },
      {
        sourceName: 'greet',
        kind: 'query',
        schema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
      },
    ],
    runtimeImport: './client-runtime',
    typesImport: './types',
  });

  test('the module source types each entry with the request type and parses as TypeScript', () => {
    expect(source).toContain(
      `export const authLogin: InputSchema<NonNullable<AuthLoginOptions['body']>> =`,
    );
    expect(source).toContain(
      `export const greet: InputSchema<NonNullable<GreetOptions['query']>> =`,
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
