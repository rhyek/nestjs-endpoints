import { NodeAdapter } from '@nestjs/platform-node';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

// Boots the whole app through file-based routing. `vitest.config.ts` has Vitest process
// nestjs-endpoints, so the endpoint files it loads are transformed like any other import.
test('the app serves its file-based routes', async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication(new NodeAdapter(), {
    logger: false,
  });
  await app.listen(0, '127.0.0.1');
  try {
    const res = await fetch(`${await app.getUrl()}/shop/recipes/list`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  } finally {
    await app.close();
  }
});
