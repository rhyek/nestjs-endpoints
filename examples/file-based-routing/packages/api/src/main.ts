import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { setupCodegen } from 'nestjs-endpoints';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: '*' });

  const clientDir = path.resolve(__dirname, '../../client/src/generated');
  await setupCodegen(app, {
    openapi: {
      // optional. setting so the openapi doc is visible.
      outputFile: path.join(process.cwd(), 'openapi.json'),
      configure: (b) => b.setTitle('Shop API'),
      // Serves Swagger UI at /docs using the same doc codegen consumes.
      ui: { path: 'docs' },
    },
    clients: [
      {
        type: 'react-query',
        outputFile: path.join(clientDir, 'react-query-client.tsx'),
      },
    ],
  });

  const port = 3000;
  await app.listen(port, () => {
    console.log(`API:        http://localhost:${port}`);
    console.log(`Swagger UI: http://localhost:${port}/docs`);
  });
}
void bootstrap();
