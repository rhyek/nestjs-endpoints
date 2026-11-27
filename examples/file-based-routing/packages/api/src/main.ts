import { NestFactory } from '@nestjs/core';
import { NestNodeApplication, NodeAdapter } from '@nestjs/platform-node';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestNodeApplication>(
    AppModule,
    new NodeAdapter(),
  );
  app.enableCors({ origin: '*' });

  const port = 3000;
  await app.listen(port, () => {
    console.log(`API: http://localhost:${port}`);
  });
}
void bootstrap();
