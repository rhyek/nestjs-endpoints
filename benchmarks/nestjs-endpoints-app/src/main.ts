import { NestFactory } from '@nestjs/core';
import { NestNodeApplication, NodeAdapter } from '@nestjs/platform-node';
import { AppModule } from './app.module';
import { resolvedVersions } from './shared';

async function bootstrap() {
  const app = await NestFactory.create<NestNodeApplication>(AppModule, new NodeAdapter(), {
    logger: false,
  });
  await app.listen(Number(process.env.PORT), '127.0.0.1');
  // The runner waits for this line, and records the versions it carries.
  console.log(
    JSON.stringify({
      ready: true,
      node: process.version,
      versions: resolvedVersions([
        '@nestjs/common',
        '@nestjs/core',
        '@nestjs/platform-node',
        'nestjs-endpoints',
        'zod',
      ]),
    }),
  );
}
void bootstrap();
