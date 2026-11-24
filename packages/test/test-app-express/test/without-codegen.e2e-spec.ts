import request from 'supertest';
import { AppModule } from '../src/app.module';
import { appWith } from './app-with';
import { openApiDocument } from './openapi-document';

// `setupCodegen` writes client SDKs, and nothing else depends on it. This spec builds the app
// from its module alone, as every spec here does, and never calls it: the endpoints still have
// their validation, their injected providers and their OpenAPI metadata.
describe('an app that never calls setupCodegen', () => {
  const setup = () => appWith([AppModule]);

  test('serves its endpoints, with validation and injected providers', async () => {
    const { app } = await setup();
    try {
      await request(app.getHttpServer()).post('/greet').send({ name: 'Satie' }).expect(200);
      await request(app.getHttpServer()).post('/greet').send({ name: 1 }).expect(400);
    } finally {
      await app.close();
    }
  });

  test('documents its endpoints in the OpenAPI document @nestjs/swagger builds', async () => {
    const { app } = await setup();
    try {
      const document = openApiDocument(app);
      expect(document.paths['/greet']?.post?.requestBody).toBeDefined();
      expect(Object.keys(document.paths).length).toBeGreaterThan(20);
    } finally {
      await app.close();
    }
  });
});
