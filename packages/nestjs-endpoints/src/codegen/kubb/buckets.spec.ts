import type { OpenAPIObject } from '@nestjs/swagger';
import { describe, expect, test } from 'vitest';
import { buildClientObjectExpression } from './buckets.js';

/** Build a minimal OpenAPI document from a `paths` map for the bucket builder. */
function doc(paths: Record<string, unknown>): OpenAPIObject {
  return {
    openapi: '3.0.0',
    info: { title: 't', version: '1' },
    paths,
  } as unknown as OpenAPIObject;
}

const plain = (src: string) => `P(${src})`;
const hook = (src: string) => `H(${src})`;

describe('buildClientObjectExpression', () => {
  test('nests namespaced ops and pairs plain + hook forms with stripped names', () => {
    const expr = buildClientObjectExpression({
      document: doc({
        '/auth/login': { post: { operationId: 'AuthLogin' } },
        '/shop/cart/add': {
          get: {
            operationId: 'ShopCartAdd',
            'x-namespace': ['shop', 'cart'],
          },
        },
      }),
      plainAccess: plain,
      hookAccess: hook,
      rootExtras: ['axios: _axios'],
    });

    // Root extras first, then root-level un-namespaced op in both forms.
    expect(expr).toContain('axios: _axios');
    expect(expr).toContain('authLogin: P(authLogin)');
    expect(expr).toContain('useAuthLogin: H(useAuthLogin)');
    // Namespaced op nested under shop.cart, with the namespace prefix stripped
    // off the property name but the original source name preserved.
    expect(expr).toMatch(/shop:\s*\{/);
    expect(expr).toMatch(/cart:\s*\{/);
    expect(expr).toContain('add: P(shopCartAdd)');
    expect(expr).toContain('useAdd: H(useShopCartAdd)');
  });

  test('axios-only build (no hookAccess) omits the hook form', () => {
    const expr = buildClientObjectExpression({
      document: doc({
        '/auth/login': { post: { operationId: 'AuthLogin' } },
      }),
      plainAccess: plain,
      hookAccess: null,
      rootExtras: [],
    });
    expect(expr).toContain('authLogin: P(authLogin)');
    expect(expr).not.toContain('useAuthLogin');
  });

  test('quotes bucket / method keys that are not safe identifiers', () => {
    const expr = buildClientObjectExpression({
      document: doc({
        '/a': {
          get: { operationId: 'CheckIn', 'x-namespace': ['check-out'] },
        },
      }),
      plainAccess: plain,
      hookAccess: null,
      rootExtras: [],
    });
    expect(expr).toContain('"check-out":');
  });

  test('throws when two operations resolve to the same wrapper property', () => {
    expect(() =>
      buildClientObjectExpression({
        document: doc({
          '/foo': { get: { operationId: 'Thing' } },
          '/bar': { get: { operationId: 'Thing' } },
        }),
        plainAccess: plain,
        hookAccess: null,
        rootExtras: [],
      }),
    ).toThrow(/resolve to the same wrapper property/);
  });

  test('tells each operation whether it carries request data', () => {
    const target = (
      src: string,
      t: { method: string; hasRequest: boolean },
    ) => `${src}:${t.method}:${t.hasRequest}`;
    const expr = buildClientObjectExpression({
      document: {
        ...doc({
          '/none': { get: { operationId: 'None' } },
          '/query': {
            get: {
              operationId: 'Query',
              parameters: [{ in: 'query', name: 'q' }],
            },
          },
          '/cookie': {
            get: {
              operationId: 'Cookie',
              parameters: [{ in: 'cookie', name: 'c' }],
            },
          },
          '/item/{id}': {
            parameters: [{ in: 'path', name: 'id', required: true }],
            get: { operationId: 'Item' },
          },
          '/ref': {
            get: {
              operationId: 'Ref',
              parameters: [{ $ref: '#/components/parameters/Auth' }],
            },
          },
          '/body': {
            post: {
              operationId: 'Body',
              requestBody: {
                content: { 'application/json': { schema: {} } },
              },
            },
          },
          '/body-ref': {
            post: {
              operationId: 'BodyRef',
              requestBody: { $ref: '#/components/requestBodies/Thing' },
            },
          },
        }),
        components: {
          parameters: { Auth: { in: 'header', name: 'x-auth' } },
          requestBodies: {
            Thing: { content: { 'application/json': { schema: {} } } },
          },
        },
      } as unknown as OpenAPIObject,
      plainAccess: target,
      hookAccess: null,
      rootExtras: [],
    });
    expect(expr).toContain('none: none:get:false');
    expect(expr).toContain('query: query:get:true');
    // Kubb gives cookies no request group.
    expect(expr).toContain('cookie: cookie:get:false');
    // Path-item level parameters count.
    expect(expr).toContain('item: item:get:true');
    expect(expr).toContain('ref: ref:get:true');
    expect(expr).toContain('body: body:post:true');
    expect(expr).toContain('bodyRef: bodyRef:post:true');
  });

  test('throws when a namespace segment collides with a reserved root key', () => {
    expect(() =>
      buildClientObjectExpression({
        document: doc({
          '/x': {
            get: { operationId: 'AxiosThing', 'x-namespace': ['axios'] },
          },
        }),
        plainAccess: plain,
        hookAccess: null,
        rootExtras: [],
      }),
    ).toThrow(/reserved/);
  });
});
