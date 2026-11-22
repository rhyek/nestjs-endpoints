import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { NestNodeApplication, NodeAdapter } from '@nestjs/platform-node';
import { setupCodegen } from 'nestjs-endpoints';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestNodeApplication>(
    AppModule,
    new NodeAdapter(),
  );
  app.enableCors({ origin: '*' });

  const clientDir = path.resolve(
    import.meta.dirname,
    '../../client/src/generated',
  );
  await setupCodegen(app, {
    clients: [
      {
        type: 'react-query',
        outputFile: path.join(clientDir, 'react-query-client.tsx'),
      },
    ],
  });

  const port = 3000;
  await app.listen(port, () => {
    console.log(`API: http://localhost:${port}`);
  });
}
void bootstrap();
