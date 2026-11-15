import { Test } from '@nestjs/testing';
import { setupOpenAPI } from 'nestjs-endpoints';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from './create-app';

// `setupOpenAPI()` mounts the Scalar page and its bundle as plain routes on
// the HTTP adapter, so each adapter has to serve them.
describe('docs ui', () => {
  test('serves the Scalar page and its bundle', async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const { app } = await createApp(moduleFixture, {
      beforeInit: async (app) => {
        app.useLogger(false);
        await setupOpenAPI(app, {
          configure: (builder) => builder.setTitle('Docs UI Test'),
          ui: { path: 'docs' },
        });
      },
    });
    try {
      const req = request(app.getHttpServer());

      const page = await req.get('/docs').expect(200);
      expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(page.text).toContain('<title>Docs UI Test</title>');
      expect(page.text).toContain('<script src="/docs/scalar.standalone.js"></script>');

      const bundle = await req.get('/docs/scalar.standalone.js').expect(200);
      expect(bundle.headers['content-type']).toBe('application/javascript; charset=utf-8');
      expect(bundle.text).toContain('createApiReference');
    } finally {
      await app.close();
    }
  });
});
