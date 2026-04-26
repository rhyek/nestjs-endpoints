import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { createApp } from './create-app';

// `EndpointRouterModule` registers middleware via `forRoutes(...)`. On
// NestJS 11 (Express 5 / path-to-regexp v8) bare `*` wildcards trigger a
// `LegacyRouteConverter` deprecation warning per call. This test guards
// against regressions in the syntax we generate.
describe('endpoint router does not emit LegacyRouteConverter warnings', () => {
  test('booting the app surfaces no Unsupported route path warnings', async () => {
    const captured: string[] = [];
    const origStderr = process.stderr.write.bind(process.stderr);
    const origStdout = process.stdout.write.bind(process.stdout);
    const wrap =
      (orig: typeof process.stderr.write) =>
      (chunk: unknown, ...rest: unknown[]) => {
        const text =
          typeof chunk === 'string'
            ? chunk
            : (chunk as Uint8Array).toString();
        if (
          text.includes('LegacyRouteConverter') ||
          text.includes('Unsupported route path')
        ) {
          captured.push(text);
        }
        return (orig as (...a: unknown[]) => boolean)(chunk, ...rest);
      };
    process.stderr.write = wrap(origStderr) as typeof process.stderr.write;
    process.stdout.write = wrap(origStdout) as typeof process.stdout.write;

    let app: Awaited<ReturnType<typeof createApp>>['app'] | undefined;
    try {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      ({ app } = await createApp(moduleFixture));
    } finally {
      process.stderr.write = origStderr;
      process.stdout.write = origStdout;
      if (app) {
        await app.close();
      }
    }

    expect(captured).toEqual([]);
  });
});
