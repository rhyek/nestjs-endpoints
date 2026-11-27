import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { type Opened, openBrowser } from './browser';
import { API_PORT, WEB_PORT } from './ports';
import { plain, type Ran, type Running } from './processes';
import { type ClientFile, contentsOf, createSandbox, type Sandbox } from './sandbox';
import {
  addEndpoint,
  addingHomePage,
  appModule,
  emptyHomePage,
  farewellEndpoint,
  fruitsHomePage,
  fruitsStore,
  greetingsEndpoint,
  greetingsHomePage,
  healthEndpoint,
  libraryPackage,
  libraryRouter,
  libraryTsconfig,
  listEndpoint,
  namespacedRouter,
  rootRoute,
  storedListEndpoint,
  unrelatedCode,
} from './sources';

// A developer's first day with nestjs-endpoints, start to finish: a new monorepo with an empty
// NestJS API and an empty TanStack Router app, the package added to the API, a React Query
// client generated into the web app, and then an endpoint written, changed, given a namespace,
// renamed and deleted, with `nest start --watch` and `vite dev` running throughout. Then a
// library joins the monorepo: a package that builds to a folder of its own, with a copy of
// nestjs-endpoints of its own and a router the API lists. Its endpoint files are added, changed
// and deleted too, and the API is restarted by hand for each: the Nest CLI restarts an app for
// its own files, not for those of a package it depends on.
//
// The steps are one story: each `test` picks up the project where the last one left it, and
// the run stops at the first that fails (`bail` in vitest.config.ts).

/** The built package, which the API installs as a `file:` dependency. */
const library = path.resolve(import.meta.dirname, '../../../nestjs-endpoints');

// The packages the developer adds, at set versions: this suite is part of the checks a pull
// request must pass, which a release published that morning must not fail.
const ZOD = 'zod@4.6.7';
const AXIOS = 'axios@1.20.0';
const REACT_QUERY = '@tanstack/react-query@5.102.8';
// What the library pins for itself: not the API's, so the library gets its own copy of the package.
const LIBRARY_ZOD = '4.6.6';

const API = `http://localhost:${API_PORT}`;
const WEB = `http://localhost:${WEB_PORT}`;

const APP_MODULE = 'apps/api/src/app.module.ts';
const ENDPOINTS = 'apps/api/src/endpoints';
const ROOT_ROUTE = 'apps/web/src/routes/__root.tsx';
const HOME_PAGE = 'apps/web/src/routes/index.tsx';
const CLIENT = 'apps/web/src/api-client.tsx';
const LIBRARY = 'libs/shared-backend';
const LIBRARY_SOURCES = `${LIBRARY}/src/endpoints`;
const LIBRARY_BUILT = `${LIBRARY}/dist/endpoints`;

const WAIT = { timeout: 60_000, interval: 100 };

let sandbox: Sandbox;
let api: Running | undefined;
let web: Running | undefined;
/** The library's own compiler, watching its sources. */
let shared: Running | undefined;
let browser: Opened | undefined;

beforeAll(async () => {
  sandbox = await createSandbox();
});

afterAll(async () => {
  await browser?.close();
  await web?.stop();
  await api?.stop();
  await shared?.stop();
  await sandbox?.destroy();
});

/** Fails with what a command printed, if it failed. */
function passed({ failed, output }: Ran) {
  expect(failed, output).toBe(false);
}

/** Fails unless an app's type check failed with an error that matches `error`. */
function failedWith({ failed, output }: Ran, error: RegExp) {
  expect(failed, output).toBe(true);
  expect(output).toMatch(error);
}

// How many times the API has started: Nest prints the line once the app has initialized, which
// is after it wrote its clients.
const STARTED = 'Nest application successfully started';
const starts = () => plain(api!.output()).split(STARTED).length - 1;

/** Whether the Nest CLI has compiled every change it saw, and the app it started is up. */
function settled() {
  const output = plain(api!.output());
  return output.lastIndexOf(STARTED) > output.lastIndexOf('File change detected');
}

/**
 * Makes a change to the API's files, and waits for the Nest CLI to have compiled it and
 * restarted the app. A watcher can miss what happens in its first moments, so a restart that
 * does not come is asked for again, by saving the app module as it is.
 */
async function apiRestartsAfter(change: () => Promise<unknown>) {
  const before = starts();
  await change();
  for (let attempt = 1; ; attempt++) {
    try {
      await vi.waitFor(
        () => {
          expect(starts()).toBeGreaterThan(before);
          expect(settled()).toBe(true);
        },
        { timeout: 20_000, interval: 100 },
      );
      break;
    } catch (error) {
      if (attempt === 4) {
        console.error(plain(api!.output()));
        throw error;
      }
      await sandbox.touch(APP_MODULE);
    }
  }
  // Nothing more is on its way: a second compile would have begun by now.
  await sleep(500);
  await vi.waitFor(() => expect(settled()).toBe(true), WAIT);
}

/** The lines of what a dev server printed since `mark` that report an error. */
const errorsSince = (server: Running, mark: number) =>
  plain(server.since(mark))
    .split('\n')
    .filter((line) => /error TS\d+|\bERROR\b|\berror\b|Error:/.test(line));

/** What the API warns of the list's endpoint file while it has no endpoint in it. */
const LIST_SERVES_NOTHING =
  'src/endpoints/fruits/list.endpoint.ts default-exports no endpoint, so it serves nothing.';

/** What the library's endpoint answers, where the API has the library's router. */
const greetings = async (basePath: string) =>
  (await (await fetch(`${API}/${basePath}/greetings`, { method: 'POST' })).json()) as unknown;

// How many times the library's compiler has compiled what it watches, with no error.
const builds = () => plain(shared!.output()).split('Found 0 errors').length - 1;

/** Makes a change to the library's files, and waits for its own compiler to have compiled it. */
async function libraryBuildsAfter(change: () => Promise<unknown>) {
  const before = builds();
  await change();
  await vi.waitFor(() => {
    expect(builds(), plain(shared!.output())).toBeGreaterThan(before);
  }, WAIT);
}

/**
 * Stops the API's dev server and starts it again, as the developer does for a change the Nest
 * CLI does not see: one in a package the API depends on.
 */
async function restartApi() {
  await api!.stop();
  api = sandbox.startScript('api', 'start:dev', [], { PORT: String(API_PORT) });
  await vi.waitFor(() => {
    expect(starts(), plain(api!.output())).toBe(1);
  }, WAIT);
}

/** The status the API answers a `POST` to `route` with. */
const post = async (route: string) => (await fetch(`${API}/${route}`, { method: 'POST' })).status;

/** Loads the page, and waits for it to list `expected`. */
async function pageLists(expected: string[]) {
  await vi.waitFor(
    async () => {
      await browser!.load();
      expect(await browser!.items()).toEqual(expected);
    },
    { timeout: 30_000, interval: 500 },
  );
  expect(browser!.errors()).toEqual([]);
}

/** The client as it was at the end of an earlier step. */
let client: Record<string, ClientFile>;
/** The client with the one query endpoint, before it had a namespace. */
let clientWithList: Record<string, string>;

const APPLES = ['apple is red', 'banana is yellow', 'lime is green'];
const GREETINGS = ['hello, ada', 'hello, grace'];

describe("a developer's first day", () => {
  test('a new monorepo installs, and both apps pass their type check', async () => {
    passed(await sandbox.pnpm('install', '--frozen-lockfile'));

    passed(await sandbox.typecheck('api'));
    passed(await sandbox.typecheck('web'));
  });

  test('the package is added to the API', async () => {
    // What Getting started has a pnpm project decide before it installs the package.
    const workspace = await sandbox.read('pnpm-workspace.yaml');
    await sandbox.write(
      'pnpm-workspace.yaml',
      workspace.replace('  esbuild: true\n', '  esbuild: true\n  nestjs-endpoints: false\n'),
    );

    passed(await sandbox.pnpm('--filter', 'api', 'add', `nestjs-endpoints@file:${library}`, ZOD));

    passed(await sandbox.typecheck('api'));
  });

  test('`NestjsEndpoints.forRoot` is set up with a client for the web app, before there is an endpoints folder', async () => {
    await sandbox.write(APP_MODULE, appModule());

    expect(await sandbox.exists(ENDPOINTS)).toBe(false);
    passed(await sandbox.typecheck('api'));
    passed(await sandbox.typecheck('web'));
  });

  test('the API starts with no endpoint, says so, and writes the client all the same', async () => {
    api = sandbox.startScript('api', 'start:dev', [], { PORT: String(API_PORT) });
    await vi.waitFor(() => {
      expect(starts(), plain(api!.output())).toBe(1);
    }, WAIT);

    const output = plain(api.output());
    expect(output).toMatch(/WARN \[nestjs-endpoints\] No endpoint files found in src\/endpoints\./);
    expect(output).toContain('Generated the react-query client ../web/src/api-client.tsx');
    expect(errorsSince(api, 0)).toEqual([]);
    client = await sandbox.client();
    expect(Object.keys(client)).toContain(CLIENT);
    expect(client[CLIENT].content).toContain('export const ApiClientProvider =');
    expect(await post('fruits/list')).toBe(404);
  });

  test('the web app provides the client, passes its type check, and starts', async () => {
    passed(await sandbox.pnpm('--filter', 'web', 'add', AXIOS, REACT_QUERY));
    await sandbox.write(ROOT_ROUTE, rootRoute);

    passed(await sandbox.typecheck('web'));
    passed(await sandbox.typecheck('api'));

    web = sandbox.startScript('web', 'dev', ['--port', String(WEB_PORT), '--strictPort']);
    await vi.waitFor(() => {
      expect(plain(web!.output())).toContain(`localhost:${WEB_PORT}`);
    }, WAIT);
    browser = await openBrowser(WEB);
    await browser.load();
    expect(await browser.heading()).toBe('Home');
    expect(browser.errors()).toEqual([]);
    expect(errorsSince(web, 0)).toEqual([]);
  });

  test('an empty endpoint file is not an endpoint: nothing is served, and the client stays as it is', async () => {
    const [apiMark, webMark] = [api!.mark(), web!.mark()];

    await apiRestartsAfter(() => sandbox.write(`${ENDPOINTS}/fruits/list.endpoint.ts`, ''));

    expect(errorsSince(api!, apiMark)).toEqual([]);
    expect(plain(api!.since(apiMark))).toContain(LIST_SERVES_NOTHING);
    expect(await post('fruits/list')).toBe(404);
    expect(await sandbox.client()).toEqual(client);
    passed(await sandbox.typecheck('api'));
    await browser!.load();
    expect(await browser!.heading()).toBe('Home');
    expect(browser!.errors()).toEqual([]);
    expect(errorsSince(web!, webMark)).toEqual([]);
  });

  test('nor is one that default-exports some other function, which is never called', async () => {
    const [apiMark, webMark] = [api!.mark(), web!.mark()];

    await apiRestartsAfter(() =>
      sandbox.write(`${ENDPOINTS}/fruits/list.endpoint.ts`, unrelatedCode),
    );

    expect(errorsSince(api!, apiMark)).toEqual([]);
    expect(plain(api!.since(apiMark))).toContain(LIST_SERVES_NOTHING);
    expect(plain(api!.output())).not.toContain("shouldn't run");
    expect(await post('fruits/list')).toBe(404);
    expect(await sandbox.client()).toEqual(client);
    passed(await sandbox.typecheck('api'));
    await browser!.load();
    expect(browser!.errors()).toEqual([]);
    expect(errorsSince(web!, webMark)).toEqual([]);
  });

  test('an endpoint in the file is served, and is in the client', async () => {
    const [apiMark, webMark] = [api!.mark(), web!.mark()];

    await apiRestartsAfter(() =>
      sandbox.write(`${ENDPOINTS}/fruits/list.endpoint.ts`, listEndpoint()),
    );

    expect(errorsSince(api!, apiMark)).toEqual([]);
    expect(plain(api!.since(apiMark))).not.toContain('serves nothing');
    expect(await post('fruits/list')).toBe(200);
    const next = await sandbox.client();
    expect(contentsOf(next)).not.toEqual(contentsOf(client));
    expect(next[CLIENT].content).toContain('useFruitsList');
    client = next;
    clientWithList = contentsOf(next);
    passed(await sandbox.typecheck('api'));
    passed(await sandbox.typecheck('web'));
    expect(errorsSince(web!, webMark)).toEqual([]);
  });

  test("the page reads a key the endpoint doesn't return, and the web type check fails", async () => {
    await sandbox.write(HOME_PAGE, fruitsHomePage({ hook: 'useFruitsList', color: 'colour' }));

    failedWith(await sandbox.typecheck('web'), /Property 'colour' does not exist on type/);
    // Both dev servers are still up.
    expect(await post('fruits/list')).toBe(200);
    expect((await fetch(WEB)).status).toBe(200);
  });

  test('with the right key, the type check passes and the page lists the fruits', async () => {
    await sandbox.write(HOME_PAGE, fruitsHomePage({ hook: 'useFruitsList' }));

    passed(await sandbox.typecheck('web'));
    await pageLists(APPLES);
  });

  test('the endpoint renames a key of its response, and the web type check fails', async () => {
    const apiMark = api!.mark();

    await apiRestartsAfter(() =>
      sandbox.write(`${ENDPOINTS}/fruits/list.endpoint.ts`, listEndpoint({ color: 'colour' })),
    );

    expect(errorsSince(api!, apiMark)).toEqual([]);
    passed(await sandbox.typecheck('api'));
    failedWith(await sandbox.typecheck('web'), /Property 'color' does not exist on type/);
  });

  test('the endpoint returns to the first key, and the client to what it was', async () => {
    await apiRestartsAfter(() =>
      sandbox.write(`${ENDPOINTS}/fruits/list.endpoint.ts`, listEndpoint()),
    );

    passed(await sandbox.typecheck('web'));
    client = await sandbox.client();
    expect(contentsOf(client)).toEqual(clientWithList);
    await pageLists(APPLES);
  });

  test('an endpoint the page does not call is added: the open page keeps working, with no reload', async () => {
    const [apiMark, webMark] = [api!.mark(), web!.mark()];
    const before = contentsOf(await sandbox.client());
    const loads = browser!.loads();

    await apiRestartsAfter(() => sandbox.write(`${ENDPOINTS}/health.endpoint.ts`, healthEndpoint));

    expect(errorsSince(api!, apiMark)).toEqual([]);
    expect((await fetch(`${API}/health`)).status).toBe(200);
    client = await sandbox.client();
    expect(contentsOf(client)).not.toEqual(before);
    expect(client[CLIENT].content).toContain('useHealth');
    // The dev server sends the open page the new client as a hot update, and does not reload it.
    await vi.waitFor(() => {
      expect(plain(web!.since(webMark))).toMatch(/hmr update .*\/src\/api-client\.tsx/);
    }, WAIT);
    await vi.waitFor(
      async () => {
        expect(await browser!.items()).toEqual(APPLES);
      },
      { timeout: 10_000, interval: 200 },
    );
    expect(browser!.errors()).toEqual([]);
    expect(errorsSince(web!, webMark)).toEqual([]);
    passed(await sandbox.typecheck('web'));
    // Checked last, so that a reload the update ends in has had the type check's time to come.
    expect(plain(web!.since(webMark))).not.toContain('page reload');
    expect(browser!.loads()).toBe(loads);
  });

  test('a router gives the folder a namespace: the client changes, and the web type check fails', async () => {
    const apiMark = api!.mark();

    await apiRestartsAfter(() => sandbox.write(`${ENDPOINTS}/fruits/router.ts`, namespacedRouter));

    expect(errorsSince(api!, apiMark)).toEqual([]);
    expect(await post('fruits/list')).toBe(200);
    const next = await sandbox.client();
    expect(contentsOf(next)).not.toEqual(clientWithList);
    expect(next[CLIENT].content).toMatch(/fruits: \{\s+list: /);
    client = next;
    passed(await sandbox.typecheck('api'));
    failedWith(await sandbox.typecheck('web'), /Property 'useFruitsList' does not exist on type/);
    // The open page got the new client, and fails on the one thing that is wrong with it.
    await vi.waitFor(() => {
      expect(browser!.errors().join('\n')).toContain('client.useFruitsList is not a function');
    }, WAIT);
    expect(browser!.errors().join('\n')).not.toContain('ApiClientProvider');
  });

  test('the page reaches the hook through the namespace, and lists the fruits again', async () => {
    await sandbox.write(HOME_PAGE, fruitsHomePage({ hook: 'fruits.useList' }));

    passed(await sandbox.typecheck('web'));
    await pageLists(APPLES);
  });

  test('a change to the handler alone restarts the API and leaves the client untouched', async () => {
    const apiMark = api!.mark();

    await apiRestartsAfter(() =>
      sandbox.write(
        `${ENDPOINTS}/fruits/list.endpoint.ts`,
        listEndpoint({
          fruits: [
            ['cherry', 'red'],
            ['plum', 'purple'],
            ['pear', 'green'],
          ],
        }),
      ),
    );

    expect(errorsSince(api!, apiMark)).toEqual([]);
    expect(plain(api!.since(apiMark))).not.toContain('Generated');
    // Their contents, and when each was written.
    expect(await sandbox.client()).toEqual(client);
    await pageLists(['cherry is red', 'plum is purple', 'pear is green']);
  });

  test('a mutation is added: the page sends it the wrong body, and the web type check fails', async () => {
    const apiMark = api!.mark();

    await apiRestartsAfter(async () => {
      await sandbox.write(`${ENDPOINTS}/fruits/store.ts`, fruitsStore);
      await sandbox.write(`${ENDPOINTS}/fruits/list.endpoint.ts`, storedListEndpoint);
      await sandbox.write(`${ENDPOINTS}/fruits/add.endpoint.ts`, addEndpoint);
    });

    expect(errorsSince(api!, apiMark)).toEqual([]);
    const next = await sandbox.client();
    expect(next[CLIENT].content).toContain('useAdd');
    client = next;
    passed(await sandbox.typecheck('api'));
    await sandbox.write(HOME_PAGE, addingHomePage({ color: 'colour' }));
    failedWith(
      await sandbox.typecheck('web'),
      /'colour' does not exist in type|Property 'color' is missing/,
    );
  });

  test('with the right body, the button adds a fruit and the list shows it', async () => {
    await sandbox.write(HOME_PAGE, addingHomePage());

    passed(await sandbox.typecheck('web'));
    await pageLists(APPLES);
    await browser!.click('Add a mango');
    await vi.waitFor(
      async () => {
        expect(await browser!.items()).toEqual([...APPLES, 'mango is orange']);
      },
      { timeout: 30_000, interval: 200 },
    );
    expect(browser!.errors()).toEqual([]);
  });

  test('the query endpoint file is renamed, and its hook with it', async () => {
    const apiMark = api!.mark();

    await apiRestartsAfter(() =>
      sandbox.rename(`${ENDPOINTS}/fruits/list.endpoint.ts`, `${ENDPOINTS}/fruits/all.endpoint.ts`),
    );

    expect(errorsSince(api!, apiMark)).toEqual([]);
    expect(await post('fruits/list')).toBe(404);
    expect(await post('fruits/all')).toBe(200);
    failedWith(await sandbox.typecheck('web'), /Property 'useList' does not exist on type/);

    await sandbox.write(HOME_PAGE, addingHomePage({ hook: 'fruits.useAll' }));
    passed(await sandbox.typecheck('web'));
    // The API restarted, so its list is the first three again.
    await pageLists(APPLES);
    client = await sandbox.client();
  });

  test('the endpoint files are deleted: they leave the client, with their namespace', async () => {
    const apiMark = api!.mark();

    await apiRestartsAfter(async () => {
      await sandbox.remove(`${ENDPOINTS}/fruits/all.endpoint.ts`);
      await sandbox.remove(`${ENDPOINTS}/fruits/add.endpoint.ts`);
    });

    expect(errorsSince(api!, apiMark)).toEqual([]);
    passed(await sandbox.typecheck('api'));
    expect(await post('fruits/all')).toBe(404);
    expect(await post('fruits/add')).toBe(404);
    const next = await sandbox.client();
    expect(contentsOf(next)).not.toEqual(contentsOf(client));
    expect(Object.values(contentsOf(next)).join('\n')).not.toMatch(/fruits|Fruits/);
    client = next;
    failedWith(await sandbox.typecheck('web'), /Property 'fruits' does not exist on type/);
    // The page still asks the client for what it no longer has.
    await browser!.load();
    expect(await browser!.items()).toEqual([]);
    expect(browser!.errors().join('\n')).toContain(
      "Cannot read properties of undefined (reading 'useAll')",
    );
  });

  test('the page stops calling them, and both apps type-check', async () => {
    await sandbox.write(HOME_PAGE, emptyHomePage);

    passed(await sandbox.typecheck('web'));
    passed(await sandbox.typecheck('api'));
    await browser!.load();
    expect(await browser!.heading()).toBe('Home');
    expect(browser!.errors()).toEqual([]);
  });

  test('a library joins the monorepo with a router of its own, built to a folder of its own, and the API lists it', async () => {
    const workspace = await sandbox.read('pnpm-workspace.yaml');
    await sandbox.write(
      'pnpm-workspace.yaml',
      workspace.replace("  - 'apps/*'\n", "  - 'apps/*'\n  - 'libs/*'\n"),
    );
    await sandbox.write(`${LIBRARY}/package.json`, libraryPackage(library, LIBRARY_ZOD));
    await sandbox.write(`${LIBRARY}/tsconfig.json`, libraryTsconfig);
    await sandbox.write(`${LIBRARY}/src/index.ts`, libraryRouter);
    await sandbox.write(`${LIBRARY_SOURCES}/greetings.endpoint.ts`, greetingsEndpoint());
    // The API has the library as a package of the workspace: a link to its folder.
    passed(await sandbox.pnpm('--filter', 'api', 'add', 'shared-backend@workspace:*'));
    passed(await sandbox.pnpm('install'));

    // The library compiles itself, as a third process beside the two dev servers.
    shared = sandbox.startScript('shared-backend', 'dev', []);
    await vi.waitFor(() => {
      expect(builds(), plain(shared!.output())).toBe(1);
    }, WAIT);
    expect(await sandbox.exists(`${LIBRARY_BUILT}/greetings.endpoint.js`)).toBe(true);

    // The library runs the copy of the package in its own folder, which is not the API's:
    // the app has two. NestJS is one for both.
    const ofApi = await sandbox.real('apps/api/node_modules/nestjs-endpoints');
    const ofLibrary = await sandbox.real(`${LIBRARY}/node_modules/nestjs-endpoints`);
    expect(ofLibrary).not.toBe(ofApi);
    const nestOf = (copy: string) => sandbox.real(path.join(copy, '../@nestjs/core'));
    expect(await nestOf(ofLibrary)).toBe(await nestOf(ofApi));

    await sandbox.write(APP_MODULE, appModule({ library: true }));
    passed(await sandbox.typecheck('api'));
    await restartApi();

    expect(errorsSince(api!, 0)).toEqual([]);
    // The library's endpoint, with the greeter the API's root router gives it.
    expect(await greetings('shared')).toEqual([
      { name: 'ada', text: 'hello, ada' },
      { name: 'grace', text: 'hello, grace' },
    ]);
    const next = await sandbox.client();
    expect(contentsOf(next)).not.toEqual(contentsOf(client));
    expect(Object.values(contentsOf(next)).join('\n')).toContain('/shared/greetings');
    client = next;
    passed(await sandbox.typecheck('web'));
  });

  test("the page lists what the library's endpoint answers", async () => {
    await sandbox.write(HOME_PAGE, greetingsHomePage());

    passed(await sandbox.typecheck('web'));
    await pageLists(GREETINGS);
  });

  test('an endpoint file added to the library is built by the library, and served and in the client once the API restarts', async () => {
    const before = starts();
    await libraryBuildsAfter(() =>
      sandbox.write(`${LIBRARY_SOURCES}/farewell.endpoint.ts`, farewellEndpoint),
    );
    expect(await sandbox.exists(`${LIBRARY_BUILT}/farewell.endpoint.js`)).toBe(true);
    // The Nest CLI compiles the API, and restarts it for its own files: not for a package's.
    await sleep(1500);
    expect(starts()).toBe(before);
    expect(await post('shared/farewell')).toBe(404);

    await restartApi();

    expect(errorsSince(api!, 0)).toEqual([]);
    expect(await post('shared/farewell')).toBe(200);
    const next = await sandbox.client();
    expect(contentsOf(next)).not.toEqual(contentsOf(client));
    expect(Object.values(contentsOf(next)).join('\n')).toContain('/shared/farewell');
    client = next;
    passed(await sandbox.typecheck('web'));
    await pageLists(GREETINGS);
  });

  test("a change to a handler of the library's is answered once the API restarts, and leaves the client untouched", async () => {
    await libraryBuildsAfter(() =>
      sandbox.write(
        `${LIBRARY_SOURCES}/greetings.endpoint.ts`,
        greetingsEndpoint(['ada', 'grace', 'linus']),
      ),
    );
    expect(await greetings('shared')).toHaveLength(2);

    await restartApi();

    expect(errorsSince(api!, 0)).toEqual([]);
    expect(await greetings('shared')).toHaveLength(3);
    expect(await sandbox.client()).toEqual(client);
    await pageLists([...GREETINGS, 'hello, linus']);
  });

  test('an endpoint file deleted from the library is served until its built file is deleted too', async () => {
    await libraryBuildsAfter(() => sandbox.remove(`${LIBRARY_SOURCES}/farewell.endpoint.ts`));
    // The compiler leaves what it built of a file that is gone, and the router finds it there.
    expect(await sandbox.exists(`${LIBRARY_BUILT}/farewell.endpoint.js`)).toBe(true);
    await restartApi();
    expect(await post('shared/farewell')).toBe(200);

    await sandbox.remove(`${LIBRARY_BUILT}/farewell.endpoint.js`);
    await sandbox.remove(`${LIBRARY_BUILT}/farewell.endpoint.d.ts`);
    await restartApi();

    expect(errorsSince(api!, 0)).toEqual([]);
    expect(await post('shared/farewell')).toBe(404);
    const next = await sandbox.client();
    expect(Object.values(contentsOf(next)).join('\n')).not.toMatch(/farewell|Farewell/);
    client = next;
    passed(await sandbox.typecheck('web'));
    await pageLists([...GREETINGS, 'hello, linus']);
  });

  test("the API registers the library's router at another base path: its routes move, and the web type check fails", async () => {
    const apiMark = api!.mark();

    // A file of the API's own: the Nest CLI restarts it.
    await apiRestartsAfter(() =>
      sandbox.write(APP_MODULE, appModule({ library: true, libraryAt: 'common' })),
    );

    expect(errorsSince(api!, apiMark)).toEqual([]);
    expect(await post('shared/greetings')).toBe(404);
    expect(await greetings('common')).toHaveLength(3);
    const next = Object.values(contentsOf(await sandbox.client())).join('\n');
    expect(next).toContain('/common/greetings');
    expect(next).not.toContain('/shared/greetings');
    // The hook is named for where the endpoint is now, in the library's namespace still.
    failedWith(await sandbox.typecheck('web'), /Property 'useGreetings' does not exist on type/);
  });

  test('the page reaches the hook by its new name, and lists the greetings again', async () => {
    await sandbox.write(HOME_PAGE, greetingsHomePage('useCommonGreetings'));

    passed(await sandbox.typecheck('web'));
    await pageLists([...GREETINGS, 'hello, linus']);
  });

  test('the page stops calling the library, and the library and both apps type-check and build', async () => {
    await sandbox.write(HOME_PAGE, emptyHomePage);

    passed(await sandbox.typecheck('web'));
    passed(await sandbox.typecheck('api'));
    await browser!.load();
    expect(await browser!.heading()).toBe('Home');
    expect(browser!.errors()).toEqual([]);

    await web!.stop();
    await api!.stop();
    await shared!.stop();
    web = api = shared = undefined;
    passed(await sandbox.runScript('shared-backend', 'build'));
    passed(await sandbox.runScript('web', 'build'));
    passed(await sandbox.runScript('api', 'build'));
  });

  test('with `generateClientsOnStart` off, the built API starts and writes no client', async () => {
    await sandbox.write(APP_MODULE, appModule({ onStart: false, library: true }));
    passed(await sandbox.runScript('api', 'build'));
    await sandbox.remove(CLIENT);
    await sandbox.remove('apps/web/src/api-client');

    api = sandbox.startScript('api', 'start:prod', [], {
      PORT: String(API_PORT),
      NODE_ENV: 'production',
    });
    await vi.waitFor(() => {
      expect(starts(), plain(api!.output())).toBe(1);
    }, WAIT);

    expect(plain(api.output())).not.toContain('clients() was called');
    expect(errorsSince(api, 0)).toEqual([]);
    expect(await sandbox.client()).toEqual({});
  });
});
