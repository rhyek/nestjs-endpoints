import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // vitest 5 turned `clearMocks` on by default, which runs
    // `vi.clearAllMocks()` before every test. The suites here are
    // `concurrent`, so that clears the call history of spies belonging to
    // tests that are still in flight.
    clearMocks: false,
    // What a project that installed `nestjs-endpoints` sets, so that Vitest processes the package
    // and the endpoint files it loads go through Vite. Here the workspace links the package from
    // `packages/`, which Vitest processes anyway: the specs that build a project with an
    // installed copy (`nest-new-project`) are the ones that prove the setting.
    server: {
      deps: { inline: ['nestjs-endpoints'] },
    },
    root: path.resolve(import.meta.dirname, '../../../'),
    include: [`${path.resolve(import.meta.dirname, 'test')}/**/*.e2e-spec.ts`],
  },
});
