import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInstalledProject, filesIn, platformPackage, run } from './installed-project';

// A monorepo whose app and whose library each resolved `nestjs-endpoints` for itself: two
// copies of the package in one process. What the library's copy made is the app's own.
//
// The project's files are written here, as text: Node runs them as they are, stripping their
// types and nothing else, so a decorator is called as a function and an import names its file.

const sources = {
  // What the app and the library both know: the library does not import from the app.
  'libs/di/index.ts': `export interface Db {
  query(sql: string): string[];
}

export interface AppUser {
  id: string;
}
`,
  // The library: a router of endpoints the apps share. Its `nestjs-endpoints` is the copy in
  // its own `node_modules`, not the app's. It names what its endpoints are given, and where
  // it is unless the app says: an environment variable, read as the file loads.
  'libs/shared-backend/index.ts': `import { EndpointRouter } from 'nestjs-endpoints';
import type { AppUser, Db } from '../di/index.ts';

export const sharedRouter = EndpointRouter.create({
  rootDirectory: './endpoints',
  basePath: process.env.SHARED_BASE_PATH ?? 'shared',
  namespace: 'shared',
  description: 'What the apps share',
  expects: { db: EndpointRouter.given<Db>(), user: EndpointRouter.given<AppUser>() },
});

export { EndpointRouter as LibraryEndpointRouter };
`,
  'libs/shared-backend/endpoints/whoami.endpoint.ts': `import { z } from 'nestjs-endpoints';
import { sharedRouter } from '../index.ts';

export default sharedRouter.endpoint.query({
  method: 'get',
  output: z.object({ user: z.string(), rows: z.array(z.string()) }),
  handler: ({ db, user }) => ({ user: user.id, rows: db.query('select 1') }),
});
`,
  'endpoints/own.endpoint.ts': `import { endpoint, z } from 'nestjs-endpoints';

export default endpoint.query({
  method: 'get',
  output: z.object({ own: z.boolean() }),
  handler: () => ({ own: true }),
});
`,
  // The app: it says what `db` and `user` are, and may say where the library's router is.
  'app.module.ts': `import path from 'node:path';
import {
  type CallHandler,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  Module,
} from '@nestjs/common';
import { decorated, NestjsEndpoints } from 'nestjs-endpoints';
import type { AppUser, Db } from './libs/di/index.ts';
import { sharedRouter } from './libs/shared-backend/index.ts';

class PgDb implements Db {
  query(sql: string) {
    return ['pg: ' + sql];
  }
}
Injectable()(PgDb);

const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): AppUser => ({
    id: context.switchToHttp().getRequest().headers['x-user'],
  }),
);

/** What of the root router ran for the request being answered. */
export const ran: string[] = [];

class RootGuard {
  canActivate() {
    ran.push('guard');
    return true;
  }
}
Injectable()(RootGuard);

class RootInterceptor {
  intercept(_: ExecutionContext, next: CallHandler) {
    ran.push('interceptor');
    return next.handle();
  }
}
Injectable()(RootInterceptor);

export class AppModule {}
Module({
  imports: [
    NestjsEndpoints.forRoot({
      router: {
        rootDirectory: './endpoints',
        basePath: 'api',
        providers: [PgDb],
        middleware: [
          (_req: unknown, _res: unknown, next: () => void) => {
            ran.push('middleware');
            next();
          },
        ],
        guards: [RootGuard],
        interceptors: [RootInterceptor],
        context: {
          inject: { db: PgDb },
          injectOnRequest: { user: decorated<AppUser>(CurrentUser()) },
        },
        routers: [
          process.env.MOUNT_AT
            ? sharedRouter.register({ basePath: process.env.MOUNT_AT })
            : sharedRouter,
        ],
      },
      clients: () => [
        { type: 'axios', outputFile: path.resolve('generated/client.ts') },
        { type: 'react-query', outputFile: path.resolve('generated/hooks.tsx') },
      ],
      generateClientsOnStart: process.env.ON_START === 'true',
    }),
  ],
})(AppModule);
`,
  // Starts the app, calls the routes it is given, and prints what it saw as a line of JSON.
  'serve.ts': `import { NestFactory } from '@nestjs/core';
import { EndpointRouter } from 'nestjs-endpoints';
import { AppModule, ran } from './app.module.ts';
import { LibraryEndpointRouter } from './libs/shared-backend/index.ts';

const [platformPackage, ...routes] = process.argv.slice(2);
const platform: Record<string, unknown> = await import(platformPackage!);
const Adapter = Object.entries(platform).find(([name]) =>
  name.endsWith('Adapter'),
)![1] as new () => never;
const app = await NestFactory.create(AppModule, new Adapter(), { logger: false });
await app.listen(0, '127.0.0.1');
const url = await app.getUrl();

const replies: Record<string, unknown> = {};
const ranFor: Record<string, string[]> = {};
for (const route of routes) {
  ran.length = 0;
  const response = await fetch(url + route, { headers: { 'x-user': 'ada' } });
  replies[route] = response.status === 200 ? await response.json() : response.status;
  ranFor[route] = [...ran];
}
await app.close();
console.log(
  JSON.stringify({
    twoCopies: (EndpointRouter as unknown) !== LibraryEndpointRouter,
    replies,
    ranFor,
  }),
);
`,
};

/** The package's own command, from the project's directory: the app's copy. */
const CLI = 'node_modules/nestjs-endpoints/dist/cli.js';

describe("an app with a router a library made with the library's own copy of the package", () => {
  let directory: string;

  beforeAll(async () => {
    directory = await createInstalledProject('shared-library-');
    for (const [file, source] of Object.entries(sources)) {
      await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
      await writeFile(path.join(directory, file), source);
    }
    // The library's copy: the same files in a folder of its own, which Node loads again. Its
    // dependencies are the project's, as NestJS must be one for the app and the library.
    await cp(
      path.join(directory, 'node_modules/nestjs-endpoints'),
      path.join(directory, 'libs/shared-backend/node_modules/nestjs-endpoints'),
      { recursive: true },
    );
  }, 120_000);

  afterAll(async () => {
    await rm(directory ?? '', { recursive: true, force: true });
  });

  /** What the app answers on `routes`, started with `env`. */
  async function served(routes: string[], env: Record<string, string> = {}) {
    const { stdout } = await run(
      process.execPath,
      ['serve.ts', await platformPackage(), ...routes],
      { cwd: directory, timeout: 60_000, env: { ...process.env, ...env } },
    );
    return JSON.parse(stdout.trim().split('\n').at(-1)!) as {
      twoCopies: boolean;
      replies: Record<string, unknown>;
      ranFor: Record<string, string[]>;
    };
  }

  const whoami = { user: 'ada', rows: ['pg: select 1'] };
  const rootRan = ['middleware', 'guard', 'interceptor'];

  test("serves the library's endpoints under its own router, with what that router gives", async () => {
    const { ranFor, ...rest } = await served(['/api/own', '/api/shared/whoami', '/shared/whoami']);
    expect(rest).toEqual({
      twoCopies: true,
      replies: { '/api/own': { own: true }, '/api/shared/whoami': whoami, '/shared/whoami': 404 },
    });
    // The root router's own, for its endpoint and for the library's alike.
    expect(ranFor).toEqual({
      '/api/own': rootRan,
      '/api/shared/whoami': rootRan,
      '/shared/whoami': [],
    });
  });

  test('serves them at the base path the library reads from the environment', async () => {
    const { replies } = await served(['/api/common/whoami', '/api/shared/whoami'], {
      SHARED_BASE_PATH: 'common',
    });
    expect(replies).toEqual({ '/api/common/whoami': whoami, '/api/shared/whoami': 404 });
  });

  test('serves them at the base path the app registers the router with', async () => {
    const { replies, ranFor } = await served(['/api/v1/lib/whoami', '/api/shared/whoami'], {
      MOUNT_AT: 'v1/lib',
    });
    expect(replies).toEqual({ '/api/v1/lib/whoami': whoami, '/api/shared/whoami': 404 });
    expect(ranFor['/api/v1/lib/whoami']).toEqual(rootRan);
  });

  /** The clients the app wrote, each file by its path under `generated`. */
  async function clients(): Promise<Record<string, string>> {
    const files = await filesIn(path.join(directory, 'generated'));
    const read = files.map(
      async (file) =>
        [file, await readFile(path.join(directory, 'generated', file), 'utf-8')] as const,
    );
    return Object.fromEntries(await Promise.all(read));
  }

  /** What every client has of the library's router: its namespace, description and routes. */
  function expectTheLibraryIn(written: Record<string, string>) {
    expect(written['client.ts']).toMatch(/\bapiOwn: /);
    expect(written['client.ts']).toMatch(
      /\/\*\* What the apps share \*\/\s+shared: \{\s+apiSharedWhoami: /,
    );
    expect(written['hooks.tsx']).toMatch(/\/\*\* What the apps share \*\/\s+shared: \{/);
    expect(written['hooks.tsx']).toContain('useApiSharedWhoami');
    const all = Object.values(written).join('\n');
    expect(all).toContain('/api/shared/whoami');
    expect(all).toContain('/api/own');
  }

  describe('its clients', () => {
    beforeEach(async () => {
      await rm(path.join(directory, 'generated'), { recursive: true, force: true });
    });

    test("have the library's endpoints, written by the command without starting the app", async () => {
      const { stdout, stderr } = await run(process.execPath, [CLI, 'generate', 'app.module.ts'], {
        cwd: directory,
        timeout: 60_000,
      });
      expect({ stdout, stderr }).toEqual({
        stdout: 'Generated generated/client.ts\nGenerated generated/hooks.tsx\n',
        stderr: '',
      });
      expectTheLibraryIn(await clients());
    });

    test("have the library's endpoints, written as the app starts", async () => {
      await served(['/api/own'], { ON_START: 'true' });
      expectTheLibraryIn(await clients());
    });

    test('are not written as the app starts when it does not ask for that', async () => {
      await served(['/api/own']);
      expect(await filesIn(path.join(directory, 'generated')).catch(() => [])).toEqual([]);
    });
  });
});
