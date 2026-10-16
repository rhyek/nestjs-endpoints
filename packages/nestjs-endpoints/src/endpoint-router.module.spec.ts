import { EndpointRouterModule } from './endpoint-router.module.js';

describe('a router no endpoint manifest covers', () => {
  test('fails at bootstrap with the fix', async () => {
    await expect(
      EndpointRouterModule.create({ rootDirectory: '/nowhere' }),
    ).rejects.toThrow(
      /no endpoint manifest covers[\s\S]*npx nestjs-endpoints init[\s\S]*setupFiles/,
    );
  });

  test('is fine when it lists its endpoints, having nothing to discover', async () => {
    const module = await EndpointRouterModule.create({
      rootDirectory: '/nowhere',
      endpoints: [],
    });
    expect(module.controllers).toEqual([]);
  });
});
