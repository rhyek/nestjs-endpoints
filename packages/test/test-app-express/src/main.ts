import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { setupCodegen } from 'nestjs-endpoints';
import { AppModule } from './app.module';

async function bootstrap() {
  // `venues/$venueId` is beside routes with a name there: Express answers a URL with the
  // first route registered that matches it, and NestJS registers names first with this.
  const app = await NestFactory.create(AppModule, { routeResolutionStrategy: 'specificity' });
  app.enableCors({
    origin: '*',
  });
  // The OpenAPI document is the app's own to build: the endpoints carry what it needs.
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  await writeFile(process.cwd() + '/openapi.json', JSON.stringify(document, null, 2));
  await setupCodegen(app, {
    clients: [
      {
        type: 'axios',
        outputFile: process.cwd() + '/generated/axios-client.ts',
      },
      {
        type: 'react-query',
        outputFile: process.cwd() + '/generated/react-query-client.tsx',
      },
    ],
    forceGenerate: true,
  });
  // Its port in development, which test-react-query-client's `dev` page calls: see its ports.ts.
  // The `dev` script sets PORT, moved into a worktree's own block when this checkout is one.
  const port = process.env.PORT || 22521;
  await app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}
void bootstrap();
