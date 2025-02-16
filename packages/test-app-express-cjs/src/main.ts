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
  const port = process.env.PORT || 3000;
  await app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}
bootstrap();
