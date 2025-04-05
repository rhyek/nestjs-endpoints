import { NestFactory } from '@nestjs/core';
import { setupCodegen } from 'nestjs-endpoints';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await setupCodegen(app, {
    clients: [
      {
        type: 'axios',
        outputFile: process.cwd() + '/generated/axios-client.ts',
      },
    ],
  });
}
void bootstrap();
