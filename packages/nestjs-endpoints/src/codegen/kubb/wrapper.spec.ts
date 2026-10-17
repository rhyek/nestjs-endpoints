import type { OpenAPIObject } from '@nestjs/swagger';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { buildReactQueryWrapperSource } from './wrapper.js';

const document = {
  openapi: '3.1.1',
  info: { title: 't', version: '1' },
  paths: {
    '/greet': {
      get: {
        operationId: 'Greet',
        parameters: [
          {
            name: 'name',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
        ],
      },
    },
    '/articles/latest': { get: { operationId: 'ArticlesLatest' } },
    '/auth/login': {
      post: {
        operationId: 'AuthLogin',
        requestBody: {
          content: { 'application/json': { schema: { type: 'object' } } },
        },
      },
    },
    '/auth/logout': { post: { operationId: 'AuthLogout' } },
    '/user-admin/list': {
      get: { operationId: 'UserAdminList', 'x-namespace': ['user-admin'] },
    },
  },
} as unknown as OpenAPIObject;

const source = buildReactQueryWrapperSource({
  document,
  opsImport: './c/clients',
  hooksImport: './c/hooks',
  runtimeImport: './c/client-runtime',
  typesImport: './c/types',
  schemasImport: './c/schemas',
  pluginOptions: undefined,
  inputSchemaNames: new Set(['greet', 'authLogin']),
});

/** The expression the wrapper assigns to `key`, up to the end of its line. */
const entry = (key: string) =>
  new RegExp(`^\\s*${key}: (.*),$`, 'm').exec(source)?.[1];

describe('buildReactQueryWrapperSource', () => {
  test('a query operation carries its query key and bound query options', () => {
    expect(entry('greet')).toContain('queryKey: _hooks.greetQueryKey');
    expect(entry('greet')).toContain(
      'queryOptions: bindQueryOptions(_hooks.greetQueryOptions, _request, true)',
    );
    expect(entry('articlesLatest')).toContain(
      'queryOptions: bindQueryOptions(_hooks.articlesLatestQueryOptions, _request, false)',
    );
    expect(entry('greet')).not.toContain('mutation');
  });

  test('a mutation operation carries its mutation key and bound mutation options', () => {
    expect(entry('authLogin')).toContain(
      'mutationKey: _hooks.authLoginMutationKey',
    );
    expect(entry('authLogin')).toContain(
      'mutationOptions: bindMutationOptions(_hooks.authLoginMutationOptions, _request)',
    );
    expect(entry('authLogout')).toContain(
      'mutationOptions: bindMutationOptions(_hooks.authLogoutMutationOptions, _request)',
    );
    expect(entry('authLogin')).not.toContain('query');
  });

  test('only operations with input carry schemas.input', () => {
    expect(entry('authLogin')).toContain(
      'schemas: { input: _schemas.authLogin }',
    );
    expect(entry('greet')).toContain('schemas: { input: _schemas.greet }');
    expect(entry('authLogout')).not.toContain('schemas');
    expect(entry('articlesLatest')).not.toContain('schemas');
    expect(source).toContain(`import * as _schemas from './c/schemas';`);
  });

  test('the call itself stays the bound request function', () => {
    for (const name of [
      'greet',
      'articlesLatest',
      'authLogin',
      'authLogout',
    ]) {
      // One call binds the client and attaches the tree, so the request
      // function keeps its generic signature (`throwOnError: false`).
      expect(entry(name)).toMatch(
        new RegExp(`^bindOperation\\(_ops\\.${name}, _request, \\{`),
      );
    }
    expect(entry('list')).toMatch(
      /^bindOperation\(_ops\.userAdminList, _request, \{/,
    );
  });

  test('hooks and root keys are unchanged', () => {
    expect(source).toContain('useGreet: bindHook(_hooks.useGreet, 1)');
    expect(source).toContain(
      'useAuthLogin: bindHook(_hooks.useAuthLogin, 0)',
    );
    expect(source).toContain('axios: _axios,');
    expect(source).toContain('[_CTX]: _ctx,');
    expect(source).toMatch(/"user-admin": \{/);
  });

  test('it imports only the binders and schemas its operations use', () => {
    const build = (paths: Record<string, unknown>) =>
      buildReactQueryWrapperSource({
        document: { ...document, paths } as unknown as OpenAPIObject,
        opsImport: './c/clients',
        hooksImport: './c/hooks',
        runtimeImport: './c/client-runtime',
        typesImport: './c/types',
        schemasImport: './c/schemas',
        pluginOptions: undefined,
        inputSchemaNames: new Set(),
      });
    const queriesOnly = build({
      '/articles/latest': { get: { operationId: 'ArticlesLatest' } },
    });
    expect(queriesOnly).toContain('  bindQueryOptions,\n');
    expect(queriesOnly).not.toContain('bindMutationOptions');
    expect(queriesOnly).not.toContain('_schemas');
    const mutationsOnly = build({
      '/auth/logout': { post: { operationId: 'AuthLogout' } },
    });
    expect(mutationsOnly).toContain('  bindMutationOptions,\n');
    expect(mutationsOnly).not.toContain('bindQueryOptions');
    // The document's every kind of operation: all of them.
    expect(source).toContain('  bindQueryOptions,\n');
    expect(source).toContain('  bindMutationOptions,\n');
  });

  test('an operation Kubb gives neither query nor mutation helpers keeps only its call', () => {
    const build = (
      pluginOptions: Parameters<
        typeof buildReactQueryWrapperSource
      >[0]['pluginOptions'],
    ) =>
      buildReactQueryWrapperSource({
        document: {
          ...document,
          paths: {
            '/greet': { get: { operationId: 'Greet' } },
            '/ping': { head: { operationId: 'Ping' } },
            '/item': { put: { operationId: 'ItemSave' } },
          },
        } as unknown as OpenAPIObject,
        opsImport: './c/clients',
        hooksImport: './c/hooks',
        runtimeImport: './c/client-runtime',
        typesImport: './c/types',
        schemasImport: './c/schemas',
        pluginOptions,
        inputSchemaNames: new Set(['itemSave']),
      });
    const defaults = build(undefined);
    expect(defaults).toMatch(
      /^\s*ping: bindClient\(_ops\.ping, _request\),$/m,
    );
    expect(defaults).not.toContain('usePing');
    expect(defaults).not.toContain('_hooks.ping');

    const noQueries = build({ query: false });
    expect(noQueries).toMatch(
      /^\s*greet: bindClient\(_ops\.greet, _request\),$/m,
    );
    expect(noQueries).not.toContain('useGreet');
    expect(noQueries).not.toContain('bindQueryOptions');

    // Still its input schema, without mutation helpers Kubb didn't generate.
    const postOnly = build({ mutation: { methods: ['POST'] } });
    expect(postOnly).toMatch(
      /^\s*itemSave: bindOperation\(_ops\.itemSave, _request, \{ schemas: \{ input: _schemas\.itemSave \} \}\),$/m,
    );
    expect(postOnly).not.toContain('useItemSave');

    // Left out by `exclude`: Kubb generated nothing for it.
    const excluded = build({
      exclude: [{ type: 'operationId', pattern: '^Greet$' }],
    });
    expect(excluded).toMatch(
      /^\s*greet: bindClient\(_ops\.greet, _request\),$/m,
    );
    expect(excluded).not.toContain('useGreet');
  });

  test('InputSchema is exported for consumers to name', () => {
    expect(source).toContain(
      `export type { InputSchema } from './c/client-runtime';`,
    );
  });

  test("a document's own InputSchema type is not hidden by the client's", () => {
    const withOwn = buildReactQueryWrapperSource({
      document: {
        ...document,
        components: { schemas: { InputSchema: { type: 'object' } } },
      },
      opsImport: './c/clients',
      hooksImport: './c/hooks',
      runtimeImport: './c/client-runtime',
      typesImport: './c/types',
      schemasImport: './c/schemas',
      pluginOptions: undefined,
      inputSchemaNames: new Set(),
    });
    expect(withOwn).toContain(`export type * from './c/types';`);
    expect(withOwn).not.toContain('export type { InputSchema }');
  });

  test('the emitted wrapper parses', () => {
    const { diagnostics } = ts.transpileModule(source, {
      fileName: 'react-query-client.tsx',
      reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.Preserve },
    });
    expect(diagnostics).toEqual([]);
  });
});
