import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { EndpointDescriptor } from '../../descriptors';
import { mergeSharedSchemas } from '../../shared-schemas';
import { generateReactQueryClient } from './generate';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'nestjs-endpoints-generate-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

function descriptor(
  fields: Pick<EndpointDescriptor, 'operationId' | 'kind' | 'method' | 'path'>,
): EndpointDescriptor {
  return {
    pathParams: [],
    namespaceChain: [],
    tags: [],
    summary: '',
    outputs: [
      {
        status: 200,
        schema: { json: { type: 'string' }, components: {} },
      },
    ],
    ...fields,
  };
}

test("the hooks, their options and customOptions' hook options follow each operation's builder, not its method", async () => {
  // A POST query and a GET mutation: the kind the method alone would give
  // each is the other one. A user override with a string pattern, which
  // `@kubb/core` reads as a regular expression and the plugin's hook options
  // compare with `===`, turns the third one's query off in both.
  const descriptors = [
    descriptor({
      operationId: 'ItemsList',
      kind: 'query',
      method: 'post',
      path: '/items/list',
    }),
    descriptor({
      operationId: 'ItemsRemove',
      kind: 'mutation',
      method: 'get',
      path: '/items/remove',
    }),
    descriptor({
      operationId: 'ItemsCount',
      kind: 'query',
      method: 'post',
      path: '/items/count',
    }),
  ];
  const outputFile = path.join(dir, 'client.tsx');
  await generateReactQueryClient({
    descriptors,
    shared: mergeSharedSchemas(descriptors),
    outputFile,
    options: {
      customOptions: { importPath: './custom-hook-options' },
      override: [
        {
          type: 'operationId',
          pattern: '^ItemsCount$',
          options: { query: false },
        },
      ],
    },
    hash: 'x',
  });
  const read = (file: string) => readFile(path.join(dir, file), 'utf8');

  // One module per plugin, and no directory of files per operation. `customOptions` adds
  // its two.
  expect((await readdir(path.join(dir, 'client'))).sort()).toEqual([
    '.kubb',
    'HookOptions.ts',
    'clients.ts',
    'custom-hook-options.ts',
    'hooks.ts',
    'schemas.ts',
    'types.ts',
  ]);

  const hooks = await read('client/hooks.ts');
  expect(hooks).toContain('export function useItemsList');
  expect(hooks).toContain('useQuery(');
  expect(hooks).toContain('export function useItemsRemove');
  expect(hooks).toContain('useMutation<');
  expect(hooks).not.toMatch(/itemsCount|ItemsCount/);

  const hookOptions = await read('client/HookOptions.ts');
  expect(hookOptions).toContain('itemsListQueryOptions');
  expect(hookOptions).toContain('itemsRemoveMutationOptions');
  expect(hookOptions).not.toContain('itemsListMutationOptions');
  expect(hookOptions).not.toContain('itemsRemoveQueryOptions');
  expect(hookOptions).not.toMatch(/itemsCount/i);

  // The wrapper refers to the helpers Kubb generated, and no others.
  expect(await read('client.tsx')).toContain('itemsCount: bindClient(_ops.itemsCount, _client),');
}, 60_000);
