import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { EndpointDescriptor } from '../descriptors.js';
import { clientHash, readClientHash } from './hash.js';
import { printedTagDescriptions } from './kubb/wrapper.js';

function descriptor(name: Record<string, unknown> = { type: 'string' }): EndpointDescriptor {
  return {
    operationId: 'UserCreate',
    kind: 'mutation',
    method: 'post',
    path: '/user/create',
    pathParams: [],
    namespaceChain: ['user'],
    tags: ['user'],
    summary: '',
    input: {
      json: { $ref: '#/components/schemas/UserCreateInput' },
      components: {
        UserCreateInput: {
          type: 'object',
          properties: { name },
          required: ['name'],
        },
      },
    },
    outputs: [
      {
        status: 200,
        schema: {
          json: { $ref: '#/components/schemas/User' },
          components: {},
        },
      },
    ],
  };
}

const shared = {
  User: {
    type: 'object',
    properties: { id: { type: 'number' } },
    required: ['id'],
  },
};

function hashOf(overrides: Partial<Parameters<typeof clientHash>[0]> = {}): string {
  return clientHash({
    descriptors: [descriptor()],
    shared,
    client: { type: 'axios' },
    version: '1.0.0',
    ...overrides,
  });
}

test('stable across runs', () => {
  expect(hashOf()).toMatch(/^[0-9a-f]{64}$/);
  expect(hashOf()).toBe(hashOf());
  // Key order is not part of the hash.
  expect(
    hashOf({
      shared: {
        User: {
          required: ['id'],
          properties: { id: { type: 'number' } },
          type: 'object',
        },
      },
    }),
  ).toBe(hashOf());
});

test('changes with a schema', () => {
  expect(hashOf({ descriptors: [descriptor({ type: 'number' })] })).not.toBe(hashOf());
  expect(
    hashOf({
      shared: {
        User: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    }),
  ).not.toBe(hashOf());
});

test('changes with the kind alone', () => {
  expect(hashOf({ descriptors: [{ ...descriptor(), kind: 'query' }] })).not.toBe(hashOf());
});

test('changes with the client type alone', () => {
  expect(hashOf({ client: { type: 'react-query' } })).not.toBe(
    hashOf({ client: { type: 'axios' } }),
  );
});

test('changes with namespaces or options', () => {
  const base = hashOf({ client: { type: 'react-query' } });
  expect(hashOf()).not.toBe(base);
  expect(hashOf({ client: { type: 'react-query', namespaces: ['user'] } })).not.toBe(base);
  expect(
    hashOf({
      client: { type: 'react-query', options: { suspense: {} } },
    }),
  ).not.toBe(base);
  // Patterns and callbacks are part of the options, though JSON drops them.
  const withPattern = (pattern: RegExp) =>
    hashOf({
      client: {
        type: 'react-query',
        options: { exclude: [{ type: 'operationId', pattern }] },
      },
    });
  expect(withPattern(/^A$/)).not.toBe(withPattern(/^B$/));
  const withQueryKey = (queryKey: () => unknown[]) =>
    hashOf({ client: { type: 'react-query', options: { queryKey } } });
  expect(withQueryKey(() => ['a'])).not.toBe(withQueryKey(() => ['b']));
});

test('changes with the namespace descriptions the wrapper prints', () => {
  const hashWith = (descriptions: Record<string, string>) =>
    hashOf({
      tagDescriptions: printedTagDescriptions(
        [descriptor()],
        new Map(Object.entries(descriptions)),
      ),
    });
  const base = hashWith({ user: 'Users', shop: 'Shop' });
  expect(hashWith({ user: 'Accounts', shop: 'Shop' })).not.toBe(base);
  // No bucket of this client prints the `shop` description.
  expect(hashWith({ user: 'Users', shop: 'Store' })).toBe(base);
});

test('printedTagDescriptions takes every prefix of the client chains', () => {
  const nested = { ...descriptor(), namespaceChain: ['shop', 'recipes'] };
  expect(
    printedTagDescriptions(
      [nested],
      new Map([
        ['shop', 'Shop'],
        ['shop/recipes', 'Recipes'],
        ['shop/orders', 'Orders'],
        ['recipes', 'Not a chain prefix'],
      ]),
    ),
  ).toEqual({ shop: 'Shop', 'shop/recipes': 'Recipes' });
});

test('changes with the version', () => {
  expect(hashOf({ version: '1.0.1' })).not.toBe(hashOf());
});

test('readClientHash reads the header', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nestjs-endpoints-hash-'));
  try {
    const hash = hashOf();
    const withHeader = path.join(dir, 'client.ts');
    await writeFile(withHeader, `// nestjs-endpoints: ${hash}\n/**\n * Generated\n */\n`);
    expect(await readClientHash(withHeader)).toBe(hash);

    // A checkout with CRLF line endings, or an editor that adds a BOM.
    const crlf = path.join(dir, 'crlf-client.ts');
    await writeFile(crlf, `// nestjs-endpoints: ${hash}\r\n/**\r\n * Generated\r\n */\r\n`);
    expect(await readClientHash(crlf)).toBe(hash);
    const bom = path.join(dir, 'bom-client.ts');
    await writeFile(bom, `\uFEFF// nestjs-endpoints: ${hash}\n`);
    expect(await readClientHash(bom)).toBe(hash);

    const withoutHeader = path.join(dir, 'old-client.ts');
    await writeFile(withoutHeader, `/**\n * Generated\n */\n`);
    expect(await readClientHash(withoutHeader)).toBeUndefined();

    expect(await readClientHash(path.join(dir, 'missing.ts'))).toBeUndefined();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
