import { endpoint } from './endpoint-fn.js';
import { EndpointRouterModule } from './endpoint-router.module.js';
import { moduleAls } from './helpers.js';

describe('a router no endpoint manifest covers', () => {
  test('fails at bootstrap with the fix', async () => {
    await expect(
      EndpointRouterModule.create({ rootDirectory: '/nowhere' }),
    ).rejects.toThrow(
      /no endpoint manifest covers[\s\S]*npx nestjs-endpoints init[\s\S]*setupFiles/,
    );
  });

  test('is fine when it only lists its endpoints, having nothing to discover', async () => {
    const module = await EndpointRouterModule.create({ endpoints: [] });
    expect(module.controllers).toEqual([]);
  });

  test('still fails when it also names a root directory', async () => {
    await expect(
      EndpointRouterModule.create({
        rootDirectory: '/nowhere',
        endpoints: [],
      }),
    ).rejects.toThrow(/no endpoint manifest covers/);
  });
});

test('a top-level router stays top-level when another router awaits it first', async () => {
  const ping = endpoint({ path: 'ping', handler: () => 'pong' });
  const router = EndpointRouterModule.create({ endpoints: [ping] });
  // What a parent router does when a file it discovered default-exports a
  // router that was already created outside any router.
  await moduleAls.run(
    {
      parentBasePath: 'api',
      parentModuleDir: '/elsewhere',
      parentRootDirectories: [],
      parentNamespaceChain: ['api'],
    },
    // Returned from an async function, as the parent's loader does, so it
    // is adopted — its `then` called — inside the parent's context.
    async () => router,
  );
  expect(Reflect.getMetadata('endpoints:path', ping)).toBe('/ping');
});
