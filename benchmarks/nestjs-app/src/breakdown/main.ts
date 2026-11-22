// The app of ../main.ts without one part of its validation, the one `PART` names (./parts.ts).
// `scripts/breakdown.ts` starts it once for each.
import {
  Module,
  StandardSchemaValidationPipe,
  type PipeTransform,
  type Type,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestNodeApplication, NodeAdapter } from '@nestjs/platform-node';
import { HealthController, UsersController } from '../app.controller';
import { resolvedVersions } from '../shared';
import {
  InHandlerController,
  InputInHandlerController,
  OutputInHandlerController,
  OutputInHandlerInterceptedController,
  PassThroughPipe,
  SchemaPipeWithoutKeyRemoval,
} from './controllers';
import { partIds, type PartId } from './parts';

const setups: Record<PartId, { pipe?: PipeTransform; controller: Type }> = {
  'no-key-removal': { pipe: new SchemaPipeWithoutKeyRemoval(), controller: UsersController },
  'pass-through-pipe': { pipe: new PassThroughPipe(), controller: InputInHandlerController },
  'no-pipe': { controller: InputInHandlerController },
  'pass-through-interceptor': {
    pipe: new StandardSchemaValidationPipe(),
    controller: OutputInHandlerInterceptedController,
  },
  'no-interceptor': {
    pipe: new StandardSchemaValidationPipe(),
    controller: OutputInHandlerController,
  },
  neither: { controller: InHandlerController },
};

const part = process.env.PART as PartId;
if (!partIds.includes(part)) {
  throw new Error(`PART is "${process.env.PART}"; it must be one of ${partIds.join(', ')}`);
}
const { pipe, controller } = setups[part];

@Module({
  controllers: [HealthController, controller],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestNodeApplication>(AppModule, new NodeAdapter(), {
    logger: false,
  });
  if (pipe) {
    app.useGlobalPipes(pipe);
  }
  await app.listen(Number(process.env.PORT), '127.0.0.1');
  // The runner waits for this line, and checks the part it names.
  console.log(
    JSON.stringify({
      ready: true,
      part,
      node: process.version,
      versions: resolvedVersions([
        '@nestjs/common',
        '@nestjs/core',
        '@nestjs/platform-node',
        'zod',
      ]),
    }),
  );
}
void bootstrap();
