import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import type { EndpointDescriptor } from '../../descriptors.js';
import type { SharedSchemas } from '../../shared-schemas.js';
import { buildReactQueryWrapperSource } from './wrapper.js';

/** A minimal descriptor for the wrapper builder. */
function descriptor(
  fields: Pick<EndpointDescriptor, 'operationId' | 'kind' | 'method' | 'path'> &
    Partial<EndpointDescriptor>,
): EndpointDescriptor {
  return {
    pathParams: [],
    namespaceChain: [],
    tags: [],
    summary: '',
    outputs: [],
    ...fields,
  };
}

const descriptors = [
  descriptor({
    operationId: 'Greet',
    kind: 'query',
    method: 'post',
    path: '/greet',
    input: {
      json: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
      components: {},
    },
  }),
  descriptor({
    operationId: 'ArticlesLatest',
    kind: 'query',
    method: 'post',
    path: '/articles/latest',
  }),
  descriptor({
    operationId: 'AuthLogin',
    kind: 'mutation',
    method: 'post',
    path: '/auth/login',
    input: { json: { type: 'object' }, components: {} },
  }),
  descriptor({
    operationId: 'AuthLogout',
    kind: 'mutation',
    method: 'post',
    path: '/auth/logout',
  }),
  descriptor({
    operationId: 'UserAdminList',
    kind: 'query',
    method: 'get',
    path: '/user-admin/list',
    namespaceChain: ['user-admin'],
  }),
];

const shared: SharedSchemas = { schemas: {}, renamed: new Map() };

const source = buildReactQueryWrapperSource({
  descriptors,
  shared,
  opsImport: './c/clients',
  hooksImport: './c/hooks',
  runtimeImport: './c/client-runtime',
  typesImport: './c/types',
  schemasImport: './c/schemas',
  pluginOptions: undefined,
  inputSchemaNames: new Set(['greet', 'authLogin']),
});

/** The expression the wrapper assigns to `key`, up to the end of its line. */
const entry = (key: string) => new RegExp(`^\\s*${key}: (.*),$`, 'm').exec(source)?.[1];

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
    expect(entry('authLogin')).toContain('mutationKey: _hooks.authLoginMutationKey');
    expect(entry('authLogin')).toContain(
      'mutationOptions: bindMutationOptions(_hooks.authLoginMutationOptions, _request)',
    );
    expect(entry('authLogout')).toContain(
      'mutationOptions: bindMutationOptions(_hooks.authLogoutMutationOptions, _request)',
    );
    expect(entry('authLogin')).not.toContain('query');
  });

  test('only operations with input or a query carry schemas', () => {
    expect(entry('authLogin')).toContain('schemas: _schemas.authLogin');
    expect(entry('greet')).toContain('schemas: _schemas.greet');
    expect(entry('authLogout')).not.toContain('schemas');
    expect(entry('articlesLatest')).not.toContain('schemas');
    expect(source).toContain(`import * as _schemas from './c/schemas';`);
  });

  test('the call itself stays the bound request function', () => {
    for (const name of ['greet', 'articlesLatest', 'authLogin', 'authLogout']) {
      // One call binds the client and attaches the tree, so the request
      // function keeps its generic signature (`throwOnError: false`).
      expect(entry(name)).toMatch(new RegExp(`^bindOperation\\(_ops\\.${name}, _request, \\{`));
    }
    expect(entry('list')).toMatch(/^bindOperation\(_ops\.userAdminList, _request, \{/);
  });

  test('hooks and root keys are unchanged', () => {
    expect(source).toContain('useGreet: bindHook(_hooks.useGreet, 1)');
    expect(source).toContain('useAuthLogin: bindHook(_hooks.useAuthLogin, 0)');
    expect(source).toContain('axios: _axios,');
    expect(source).toContain('[_CTX]: _ctx,');
    expect(source).toMatch(/"user-admin": \{/);
  });

  test('it imports only the binders and schemas its operations use', () => {
    const build = (only: EndpointDescriptor[]) =>
      buildReactQueryWrapperSource({
        descriptors: only,
        shared,
        opsImport: './c/clients',
        hooksImport: './c/hooks',
        runtimeImport: './c/client-runtime',
        typesImport: './c/types',
        schemasImport: './c/schemas',
        pluginOptions: undefined,
        inputSchemaNames: new Set(),
      });
    const queriesOnly = build([
      descriptor({
        operationId: 'ArticlesLatest',
        kind: 'query',
        method: 'post',
        path: '/articles/latest',
      }),
    ]);
    expect(queriesOnly).toContain('  bindQueryOptions,\n');
    expect(queriesOnly).not.toContain('bindMutationOptions');
    expect(queriesOnly).not.toContain('_schemas');
    const mutationsOnly = build([
      descriptor({
        operationId: 'AuthLogout',
        kind: 'mutation',
        method: 'post',
        path: '/auth/logout',
      }),
    ]);
    expect(mutationsOnly).toContain('  bindMutationOptions,\n');
    expect(mutationsOnly).not.toContain('bindQueryOptions');
    // Every kind of operation in the descriptors: all of them.
    expect(source).toContain('  bindQueryOptions,\n');
    expect(source).toContain('  bindMutationOptions,\n');
  });

  test('an operation Kubb gives neither query nor mutation helpers keeps only its call', () => {
    const build = (
      pluginOptions: Parameters<typeof buildReactQueryWrapperSource>[0]['pluginOptions'],
    ) =>
      buildReactQueryWrapperSource({
        descriptors: [
          descriptor({
            operationId: 'Greet',
            kind: 'query',
            method: 'post',
            path: '/greet',
          }),
          descriptor({
            operationId: 'Ping',
            kind: 'query',
            method: 'get',
            path: '/ping',
          }),
          descriptor({
            operationId: 'ItemSave',
            kind: 'mutation',
            method: 'put',
            path: '/item',
          }),
        ],
        shared,
        opsImport: './c/clients',
        hooksImport: './c/hooks',
        runtimeImport: './c/client-runtime',
        typesImport: './c/types',
        schemasImport: './c/schemas',
        pluginOptions,
        inputSchemaNames: new Set(['itemSave']),
      });
    const defaults = build(undefined);
    expect(defaults).toContain('usePing: bindHook(_hooks.usePing, 0)');
    expect(defaults).toContain('useItemSave: bindHook(_hooks.useItemSave, 0)');

    const noQueries = build({ query: false });
    expect(noQueries).toMatch(/^\s*greet: bindClient\(_ops\.greet, _request\),$/m);
    expect(noQueries).not.toContain('useGreet');
    expect(noQueries).not.toContain('bindQueryOptions');

    // Still its input schema, without mutation helpers Kubb didn't generate.
    const noMutations = build({ mutation: false });
    expect(noMutations).toMatch(
      /^\s*itemSave: bindOperation\(_ops\.itemSave, _request, \{ schemas: _schemas\.itemSave \}\),$/m,
    );
    expect(noMutations).not.toContain('useItemSave');

    // Turned off for one operation by the first override it matches.
    const pingOff = build({
      override: [
        {
          type: 'operationId',
          pattern: '^Ping$',
          options: { query: false },
        },
      ],
    });
    expect(pingOff).toMatch(/^\s*ping: bindClient\(_ops\.ping, _request\),$/m);
    expect(pingOff).not.toContain('usePing');
    expect(pingOff).toContain('useGreet');

    // Left out by `exclude`: Kubb generated nothing for it.
    const excluded = build({
      exclude: [{ type: 'operationId', pattern: '^Greet$' }],
    });
    expect(excluded).toMatch(/^\s*greet: bindClient\(_ops\.greet, _request\),$/m);
    expect(excluded).not.toContain('useGreet');
  });

  test('InputSchema is exported for consumers to name', () => {
    expect(source).toContain(`export type { InputSchema } from './c/client-runtime';`);
  });

  test("the app's own InputSchema type is not hidden by the client's", () => {
    const withOwn = buildReactQueryWrapperSource({
      descriptors: [
        ...descriptors,
        descriptor({
          operationId: 'FormSave',
          kind: 'mutation',
          method: 'post',
          path: '/form/save',
          input: {
            json: { $ref: '#/components/schemas/InputSchema' },
            components: {},
          },
        }),
      ],
      shared: {
        schemas: { InputSchema: { type: 'object' } },
        renamed: new Map(),
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

  test("another namespace's InputSchema does not hide the client's", () => {
    // The app's `InputSchema` belongs to an `admin` operation; this client
    // is filtered to `public`, so Kubb generates no type of that name.
    const filtered = buildReactQueryWrapperSource({
      descriptors: [
        descriptor({
          operationId: 'PublicGreet',
          kind: 'query',
          method: 'post',
          path: '/public/greet',
          namespaceChain: ['public'],
        }),
      ],
      shared: {
        schemas: { InputSchema: { type: 'object' } },
        renamed: new Map(),
      },
      opsImport: './c/clients',
      hooksImport: './c/hooks',
      runtimeImport: './c/client-runtime',
      typesImport: './c/types',
      schemasImport: './c/schemas',
      pluginOptions: undefined,
      inputSchemaNames: new Set(),
    });
    expect(filtered).toContain(`export type { InputSchema } from './c/client-runtime';`);
  });

  test('a query without search parameters binds its hook without a request', () => {
    const emptyQuery = buildReactQueryWrapperSource({
      descriptors: [
        descriptor({
          operationId: 'Everything',
          kind: 'query',
          method: 'get',
          path: '/everything',
          query: {
            json: { type: 'object', properties: {} },
            components: {},
            parameters: [],
          },
        }),
      ],
      shared,
      opsImport: './c/clients',
      hooksImport: './c/hooks',
      runtimeImport: './c/client-runtime',
      typesImport: './c/types',
      schemasImport: './c/schemas',
      pluginOptions: undefined,
      inputSchemaNames: new Set(),
    });
    expect(emptyQuery).toContain('useEverything: bindHook(_hooks.useEverything, 0)');
    expect(emptyQuery).toContain(
      'queryOptions: bindQueryOptions(_hooks.everythingQueryOptions, _request, false)',
    );
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
