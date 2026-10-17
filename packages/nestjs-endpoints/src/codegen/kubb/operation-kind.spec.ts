import type { OpenAPIObject } from '@nestjs/swagger';
import { describe, expect, test } from 'vitest';
import { operationKinds } from './operation-kind.js';

const document = {
  openapi: '3.1.1',
  info: { title: 't', version: '1' },
  paths: {
    '/greet': { get: { operationId: 'Greet', tags: ['public'] } },
    '/auth/login': {
      post: {
        operationId: 'AuthLogin',
        tags: ['auth'],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object' } } },
        },
      },
    },
    '/upload': {
      put: {
        operationId: 'Upload',
        'x-internal': true,
        requestBody: {
          content: {
            'multipart/form-data': { schema: { type: 'object' } },
          },
        },
      },
    },
    '/ping': { head: { operationId: 'Ping' } },
  },
} as unknown as OpenAPIObject;

type Options = Parameters<typeof operationKinds>[1];
const kinds = (options: Options) =>
  Object.fromEntries(operationKinds(document, options));

describe('operationKinds', () => {
  test("classifies by the react-query plugin's default methods", () => {
    expect(kinds(undefined)).toEqual({
      Greet: 'query',
      AuthLogin: 'mutation',
      Upload: 'mutation',
    });
  });

  test('takes custom methods, and false turns a kind off', () => {
    expect(
      kinds({ query: false, mutation: { methods: ['POST'] } }),
    ).toEqual({ AuthLogin: 'mutation' });
    expect(kinds({ query: { methods: ['POST'] } })).toEqual({
      AuthLogin: 'query',
      Upload: 'mutation',
    });
  });

  test('exclude leaves out what any filter matches, by each filter type', () => {
    expect(kinds({ exclude: [{ type: 'tag', pattern: 'auth' }] })).toEqual(
      {
        Greet: 'query',
        Upload: 'mutation',
      },
    );
    expect(
      kinds({
        exclude: [{ type: 'operationId', pattern: '^(Greet|Upload)$' }],
      }),
    ).toEqual({ AuthLogin: 'mutation' });
    expect(
      kinds({ exclude: [{ type: 'method', pattern: 'post' }] }),
    ).toEqual({
      Greet: 'query',
      Upload: 'mutation',
    });
    expect(
      kinds({ exclude: [{ type: 'path', pattern: /^\/auth\// }] }),
    ).toEqual({ Greet: 'query', Upload: 'mutation' });
    expect(
      kinds({ exclude: [{ type: 'contentType', pattern: 'multipart' }] }),
    ).toEqual({ Greet: 'query', AuthLogin: 'mutation' });
    expect(
      kinds({ exclude: [{ type: 'extension', key: 'x-internal' }] }),
    ).toEqual({ Greet: 'query', AuthLogin: 'mutation' });
  });

  test('include keeps only what some filter matches', () => {
    expect(
      kinds({ include: [{ type: 'tag', pattern: 'public' }] }),
    ).toEqual({
      Greet: 'query',
    });
    // As in Kubb: a schema-only include matches no operation.
    expect(
      kinds({ include: [{ type: 'schemaName', pattern: 'Anything' }] }),
    ).toEqual({});
  });

  test("the first matching override's query and mutation options apply", () => {
    expect(
      kinds({
        override: [
          {
            type: 'operationId',
            pattern: 'Greet',
            options: { query: false },
          },
          {
            type: 'operationId',
            pattern: 'Greet',
            options: { query: { methods: ['GET'] } },
          },
          {
            type: 'method',
            pattern: 'put',
            options: { mutation: { methods: ['POST'] } },
          },
        ],
      }),
    ).toEqual({ AuthLogin: 'mutation' });
  });
});
