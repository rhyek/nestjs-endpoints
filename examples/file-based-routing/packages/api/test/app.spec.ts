import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

// Boots the whole app through file-based routing. No Vitest configuration is
// needed: endpoint files load through `src/endpoints.gen.ts`, which is app
// code, so Vite transforms them like any other import.
test('the app serves its file-based routes', async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
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
