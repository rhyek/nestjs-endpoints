import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { EndpointDescriptor } from '../../descriptors.js';
import { mergeSharedSchemas } from '../../shared-schemas.js';
import { generateReactQueryClient } from './generate.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(
    path.join(os.tmpdir(), 'nestjs-endpoints-generate-'),
  );
});
afterEach(() => rm(dir, { recursive: true, force: true }));

function descriptor(
  fields: Pick<
    EndpointDescriptor,
    'operationId' | 'kind' | 'method' | 'path'
  >,
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

  const hooks = await read('client/hooks/index.ts');
  expect(hooks).toContain(
    'export { itemsListQueryKey, itemsListQueryOptions, useItemsList }',
  );
  expect(hooks).toContain(
    'export { itemsRemoveMutationKey, itemsRemoveMutationOptions, useItemsRemove }',
  );
  expect(hooks).not.toMatch(/itemsCount|ItemsCount/);
  expect(await read('client/hooks/useItemsList.ts')).toContain(
    'useQuery(',
  );
  expect(await read('client/hooks/useItemsRemove.ts')).toContain(
    'useMutation<',
  );

  const hookOptions = await read('client/hooks/HookOptions.ts');
  expect(hookOptions).toContain('itemsListQueryOptions');
  expect(hookOptions).toContain('itemsRemoveMutationOptions');
  expect(hookOptions).not.toContain('itemsListMutationOptions');
  expect(hookOptions).not.toContain('itemsRemoveQueryOptions');
  expect(hookOptions).not.toMatch(/itemsCount/i);

  // The wrapper refers to the helpers Kubb generated, and no others.
  expect(await read('client.tsx')).toContain(
    'itemsCount: bindClient(_ops.itemsCount, _request),',
  );
}, 60_000);
