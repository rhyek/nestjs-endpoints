import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupEndpoints } from 'nestjs-endpoints';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await setupEndpoints(app, {
    openapi: {
      outputFile: 'openapi.json',
    },
  });
  await app.listen(3000);
}
bootstrap();
