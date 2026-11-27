## Git workflow

@~/Dev/synced-utils/docs/git-workflow.md

## The project

- Please read the README.md file to understand what this project is about.
- The only deployable lives at packages/nestjs-endpoints
  - It builds with tsdown in unbundle mode (`packages/nestjs-endpoints/tsdown.config.ts`, run by `scripts/build.sh`; `pnpm dev` watches): one `dist/*.js`, `.d.ts` and their maps per source file, as `tsc` would lay it out. It type-checks while it writes the declarations, so a type error fails the build.
  - Its sources import each other without an extension (`from './helpers'`); the build writes them out as `./helpers.js`. The test apps, benchmarks, examples and docs keep `.js`: they're written the way a consumer on Node ESM writes them.
- The repo builds and tests with TypeScript 7.1, but the library supports TypeScript 6.0 and later: its source and the types it publishes use nothing newer, and the docs say 6. The docs site stays on TypeScript 6 for Twoslash, which needs the classic compiler API.
- There are five test projects at packages/test:
  - All test-app-\* projects are meant to test backend calls both regular http calls and using the generated axios client
  - I only write tests for those in packages/test/test-app-express, since scripts/test.sh copies the app and test source files to the other test-app-\* projects.
    - Main test file for http calls using supertest are in packages/test/test-app-express/test/app.e2e-spec.ts
    - Test file for calls using the axios client are in packages/test/test-app-express/test/client.e2e-spec.ts
    - Other files have specific purposes
  - packages/test/test-react-query-client is meant to test the generated react-query client.
    - You will need to first add code in packages/test/test-react-query-client/src that imports the client queries or mutations, and then add tests in packages/test/test-react-query-client/test
  - packages/test/test-journey is one persisted spec of a developer's first day: it copies assets/project (a monorepo with an empty `nest new` API and an empty TanStack Router app) to a temporary folder, installs the built library with `file:`, and drives `nest start --watch`, `vite dev` and a headless browser through adding, changing and deleting an endpoint, then through the same for a library of the monorepo whose router the API lists: a package that builds to its own `dist` and runs a copy of nestjs-endpoints of its own, with the API restarted by hand for its changes. It never runs `nestjs-endpoints generate`, which has its own specs in test-app-express.
- Superpowers writes to `maintenance/docs/superpowers/`, not its default `docs/superpowers/`: brainstorming's specs go in `specs/YYYY-MM-DD-<topic>-design.md` and writing-plans' plans in `plans/YYYY-MM-DD-<feature-name>.md`. The folder is gitignored, so they are never committed. `docs/` is only for the public documentation site.
