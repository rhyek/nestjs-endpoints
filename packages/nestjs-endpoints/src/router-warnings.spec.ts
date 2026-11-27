import path from 'node:path';
import { Logger } from '@nestjs/common';
import { empty, fixtures, pathsOf, start } from '../test/routing';
import { endpoint } from './endpoint-fn';
import { EndpointRouter } from './endpoint-router';
import { NestjsEndpoints } from './nestjs-endpoints';
import { shown } from './routing-files';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const warnings = () => warn.mock.calls.map((call: unknown[]) => String(call[0]));
const fixture = (name: string) => path.join(fixtures, name);

describe('the root router of an app, with nothing to serve', () => {
  const nothingIn = (directory: string) => `No endpoint files found in ${shown(directory)}.`;

  test('warns when its folder is not there', async () => {
    await start(NestjsEndpoints.forRoot({ router: { rootDirectory: fixture('missing') } }));
    expect(warnings()).toEqual([nothingIn(fixture('missing'))]);
  });

  test('warns when its folder has no endpoint file', async () => {
    await start(NestjsEndpoints.forRoot({ router: { rootDirectory: empty } }));
    expect(warnings()).toEqual([nothingIn(empty)]);
  });

  test('says nothing when it has an endpoint file', async () => {
    await start(NestjsEndpoints.forRoot({ router: { rootDirectory: fixture('basic') } }));
    expect(warnings()).toEqual([]);
  });

  test('says nothing when it has only routers under it', async () => {
    await start(NestjsEndpoints.forRoot({ router: { rootDirectory: fixture('siblings') } }));
    expect(warnings()).toEqual([]);
  });

  test('says nothing when its only router exports itself by name', async () => {
    await start(NestjsEndpoints.forRoot({ router: { rootDirectory: fixture('by-hand') } }));
    expect(warnings()).toEqual([]);
  });

  test('says nothing when it has only the routers it lists', async () => {
    const listed = EndpointRouter.create({
      rootDirectory: empty,
      basePath: 'listed',
      endpoints: [endpoint.query({ path: 'in-a-listed-router', handler: () => null })],
    });
    await start(
      NestjsEndpoints.forRoot({ router: { rootDirectory: fixture('missing'), routers: [listed] } }),
    );
    expect(warnings()).toEqual([]);
  });

  test('says nothing when its endpoints are listed', async () => {
    const listed = endpoint.query({ path: '/listed', handler: () => 'listed' });
    await start(
      NestjsEndpoints.forRoot({
        router: { rootDirectory: fixture('missing'), endpoints: [listed] },
      }),
    );
    expect(warnings()).toEqual([]);
  });
});

test('a router that is not the root says nothing of an empty folder', async () => {
  await start(EndpointRouter.create({ rootDirectory: empty }));
  expect(warnings()).toEqual([]);
});

describe('a file named as an endpoint file that default-exports no endpoint', () => {
  const servesNothing = (file: string) =>
    `${shown(file)} default-exports no endpoint, so it serves nothing.`;

  test('is warned of once, whether it is empty or holds other code', async () => {
    const router = EndpointRouter.create({ rootDirectory: fixture('warned') });
    expect(pathsOf(await router)).toEqual(['real']);
    expect(warnings()).toEqual([
      servesNothing(fixture('warned/blank.endpoint.ts')),
      servesNothing(fixture('warned/unrelated.endpoint.ts')),
    ]);
  });

  test('is warned of when its default export is something else', async () => {
    await EndpointRouter.create({ rootDirectory: fixture('not-endpoints') });
    expect(warnings()).toEqual([
      servesNothing(fixture('not-endpoints/settings.endpoint.ts')),
      servesNothing(fixture('not-endpoints/text.endpoint.ts')),
    ]);
  });
});
