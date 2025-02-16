import { NestFactory } from '@nestjs/core';
import { setupEndpoints } from 'nestjs-endpoints';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await setupEndpoints(app, {
    openapi: {
      outputFile: 'openapi.json',
    },
  });
  const port = process.env.PORT || 3000;
  await app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}
void bootstrap();
