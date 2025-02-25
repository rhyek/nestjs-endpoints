import { NestFactory } from '@nestjs/core';
import { setupOpenAPI } from 'nestjs-endpoints';
import { generate } from 'orval';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await setupOpenAPI(app, {
    outputFile: 'openapi.json',
  });
  void generate();
}
void bootstrap();
