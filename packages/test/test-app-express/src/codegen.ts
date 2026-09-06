import { NestFactory } from '@nestjs/core';
import { setupCodegen } from 'nestjs-endpoints';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await setupCodegen(app, {
    clients: [
      // Full-access backend client — every operation across every
      // namespace, both plain and un-namespaced.
      {
        type: 'axios',
        outputFile: process.cwd() + '/generated/axios-client.ts',
      },
      {
        type: 'react-query',
        outputFile: process.cwd() + '/generated/react-query-client.tsx',
      },
      // Filtered front-end client: only the `shop` namespace (exercises
      // the per-client `namespaces` filter and schema pruning).
      {
        type: 'react-query',
        outputFile:
          process.cwd() + '/generated/shop-react-query-client.tsx',
        namespaces: ['shop'],
      },
    ],
    forceGenerate: true,
  });
}
void bootstrap();
