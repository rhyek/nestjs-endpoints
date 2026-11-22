import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { createApp } from './create-app';

// `EndpointRouterModule` registers middleware via `forRoutes(...)`. Express 5 /
// path-to-regexp v8 require named wildcards (`{*path}`); a bare `*` still
// routes, but Nest's `LegacyRouteConverter` emits a deprecation warning per
// call. This test guards against regressions in the syntax we generate.
//
// It spies on `Logger.prototype.warn` rather than wrapping `process.stdout`:
// `Test.createTestingModule()` suppresses the logger's *output*, so a
// stdout-based assertion passes even while the warnings are being raised.
// The logger method itself is still invoked, which makes it a truthful
// observation point.
describe('endpoint router does not emit LegacyRouteConverter warnings', () => {
  test('booting the app surfaces no Unsupported route path warnings', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn');

    let app: Awaited<ReturnType<typeof createApp>>['app'] | undefined;
    try {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      ({ app } = await createApp(moduleFixture));
    } finally {
      if (app) {
        await app.close();
      }
    }

    const unsupported = warnSpy.mock.calls
      .map((args) => String(args[0]))
      .filter((message) => message.includes('Unsupported route path'));
    warnSpy.mockRestore();

    expect(unsupported).toEqual([]);
  });
});
