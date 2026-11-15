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
    // An installed `nestjs-endpoints` lives under `node_modules`, which Vitest
    // externalizes: Node, not Vite, runs it. Here the workspace links it from
    // `packages/`, which Vitest would otherwise process, so force the
    // consumer's situation. Endpoint files must still load through Vite.
    server: {
      deps: { external: [/\/packages\/nestjs-endpoints\/dist\//] },
    },
    root: path.resolve(import.meta.dirname, '../../../'),
    include: [`${path.resolve(import.meta.dirname, 'test')}/**/*.e2e-spec.ts`],
  },
});
