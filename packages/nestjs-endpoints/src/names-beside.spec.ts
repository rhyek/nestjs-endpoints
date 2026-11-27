import type { HttpServer } from '@nestjs/common';
import {
  caseSensitiveOf,
  namedRequest,
  namesBeside as namesIn,
  routeTree,
  type Served,
} from './names-beside';

/** The tree of `paths`, each the route of itself. */
const tree = (paths: string[]) => routeTree(paths.map((path) => [path, path]));

const namesBeside = (paths: string[], others: string[]) => namesIn(paths, tree(others));

const plain: Served = { prefix: '', versionPaths: [], caseSensitive: true };

/** Whether the middleware of a router at `basePath` skips each of `paths`, beside `others`. */
function skips(basePath: string, others: string[], paths: string[], served = plain) {
  const named = namedRequest(basePath, tree(others), served);
  return Object.fromEntries(paths.map((path) => [path, named?.(path) ?? false]));
}

describe('what a router skips its middleware for: a URL with a name beside a parameter of its base path', () => {
  test('is one of the name, or under it, where the parameter is', () => {
    expect(
      skips(
        'venues/:venueId',
        [
          '/venues/events/:eventId/view',
          '/venues/events/list',
          // An endpoint file with a dot in its name: two segments.
          '/venues/reports/summary',
          'venues/featured',
        ],
        [
          '/venues/events',
          '/venues/events/x/y',
          '/venues/reports/summary',
          '/venues/featured',
          '/venues/abc/view',
          '/venues/eventsx',
          '/venues',
        ],
      ),
    ).toEqual({
      '/venues/events': true,
      '/venues/events/x/y': true,
      '/venues/reports/summary': true,
      '/venues/featured': true,
      '/venues/abc/view': false,
      '/venues/eventsx': false,
      '/venues': false,
    });
  });

  test('is none for a base path with no parameter, or no name beside it', () => {
    expect(
      namedRequest('venues', tree(['/venues/list', '/venues/:venueId/view']), plain),
    ).toBeUndefined();
    expect(namedRequest('', tree(['/venues/list']), plain)).toBeUndefined();
    expect(
      namedRequest(
        'venues/:venueId',
        tree(['/places/events/list', '/venues', '/other', '/']),
        plain,
      ),
    ).toBeUndefined();
  });

  test('is none for a route with a parameter or a wildcard there too: it is no name', () => {
    expect(
      namedRequest('venues/:venueId', tree(['/venues/:placeId/view', '/venues/*rest']), plain),
    ).toBeUndefined();
  });

  test('is of a name as long as the base path, which the pattern takes in itself', () => {
    expect(
      skips(
        ':tenantId',
        ['/health', '/auth/login', '/health/live'],
        ['/health', '/auth/x', '/acme/list'],
      ),
    ).toEqual({ '/health': true, '/auth/x': true, '/acme/list': false });
  });

  test('is of a name beside any parameter, for a base path with several', () => {
    expect(
      skips(
        'venues/:venueId/tables/:tableId',
        [
          '/venues/:venueId/tables/summary/list',
          '/venues/events/tables/:tableId/view',
          '/venues/:venueId/chairs/:chairId/view',
        ],
        ['/venues/abc/tables/summary', '/venues/events/tables/1', '/venues/abc/tables/1'],
      ),
    ).toEqual({
      '/venues/abc/tables/summary': true,
      '/venues/events/tables/1': true,
      '/venues/abc/tables/1': false,
    });
  });

  test('leaves out a name under a name of its own where the base path has a parameter: that route is on the side of the other name', () => {
    // `/lanes/extra/…` is `lanes/extra/:id`'s side: `list` there is no name beside `:slug`.
    expect(skips('lanes/:slug', ['/lanes/extra/:id'], ['/lanes/extra/list'])).toEqual({
      '/lanes/extra/list': true,
    });
    expect(namedRequest('lanes/extra/:id', tree(['/lanes/:slug/list']), plain)).toBeUndefined();
  });

  test('reads a part that may be left out, with a slash in it, as each URL it gives', () => {
    expect(
      skips(
        'lanes/:id',
        ['/lanes/extra{/deep/:x}', '/lanes{/more}'],
        ['/lanes/extra/x', '/lanes/more', '/lanes/x'],
      ),
    ).toEqual({ '/lanes/extra/x': true, '/lanes/more': true, '/lanes/x': false });
  });

  test('reads a name with characters of a pattern, or of an expression, as text', () => {
    expect(
      skips(
        'lanes/:id',
        ['/lanes/a\\:b', '/lanes/c(d)', '/lanes/e.f'],
        ['/lanes/a:b/x', '/lanes/c(d)', '/lanes/e.f', '/lanes/eXf'],
      ),
    ).toEqual({
      '/lanes/a:b/x': true,
      '/lanes/c(d)': true,
      '/lanes/e.f': true,
      '/lanes/eXf': false,
    });
  });

  test('reads a name with characters of an expression, beside text of its base path, as text', () => {
    expect(
      skips(
        'lanes/:id',
        ['/lanes/a.b+c(d)', '/lanes/$x^'],
        ['/lanes/a.b+c(d)', '/lanes/aXb+c(d)', '/lanes/$x^/y', '/lanes/x'],
      ),
    ).toEqual({
      '/lanes/a.b+c(d)': true,
      '/lanes/aXb+c(d)': false,
      '/lanes/$x^/y': true,
      '/lanes/x': false,
    });
    // Its base path's text is read as text too, of either case where the router ignores case.
    expect(
      skips('a.b/:id', ['/a.b/list'], ['/A.B/list', '/aXb/list'], {
        ...plain,
        caseSensitive: false,
      }),
    ).toEqual({ '/A.B/list': true, '/aXb/list': false });
  });

  test('reads a value of another case as the name only where the router ignores case', () => {
    expect(skips('Lanes/:id', ['/lanes/List'], ['/lanes/LIST/view'])).toEqual({
      '/lanes/LIST/view': false,
    });
    expect(
      skips('Lanes/:id', ['/lanes/List'], ['/lanes/LIST/view'], { ...plain, caseSensitive: false }),
    ).toEqual({ '/lanes/LIST/view': true });
  });

  test("reads the URL under the app's prefix and the router's version paths, or without them", () => {
    expect(
      skips(
        'lanes/:id',
        ['/lanes/list'],
        [
          '/api/v1/lanes/list/x',
          '/api/lanes/list',
          '/lanes/list',
          '/api/v1/lanes/abc',
          '/api/v2/lanes/list',
        ],
        { prefix: '/api', versionPaths: ['', '/v1'], caseSensitive: true },
      ),
    ).toEqual({
      '/api/v1/lanes/list/x': true,
      '/api/lanes/list': true,
      '/lanes/list': true,
      '/api/v1/lanes/abc': false,
      // Not a version of the router's: its pattern does not take it in.
      '/api/v2/lanes/list': false,
    });
  });

  test('reads a value as it decodes, and one that does not decode as no name', () => {
    expect(skips('lanes/:id', ['/lanes/list'], ['/lanes/l%69st', '/lanes/%E0%A4%A'])).toEqual({
      '/lanes/l%69st': true,
      '/lanes/%E0%A4%A': false,
    });
  });
});

describe("whether an adapter's router reads URLs as of their case", () => {
  test.each([
    ['one that does not tell', {}, true],
    [
      'one that tells it ignores case',
      { getRouteMatchingOptions: () => ({ caseSensitive: false }) },
      false,
    ],
    ['one that tells nothing of case', { getRouteMatchingOptions: () => ({}) }, true],
    ['one that answers nothing', { getRouteMatchingOptions: () => undefined }, true],
  ])('is so, as NestJS reads it, for %s', (_, adapter, caseSensitive) => {
    expect(caseSensitiveOf(adapter as unknown as HttpServer)).toBe(caseSensitive);
  });
});

describe('the values a parameter does not take: the names beside it', () => {
  test('are those of the routes with a name where it is, alike above it', () => {
    expect(
      namesBeside(
        ['/lanes/:id/view'],
        ['/lanes/list', '/lanes/extra/list', '/lanes/:id/other', '/other/x'],
      ),
    ).toEqual(new Map([['id', new Set(['list', 'extra'])]]));
  });

  test('are given for each parameter of a path', () => {
    expect(
      namesBeside(
        ['/venues/:venueId/tables/:tableId'],
        ['/venues/events/list', '/venues/:venueId/tables/summary', '/venues/events/tables/summary'],
      ),
    ).toEqual(
      new Map([
        ['venueId', new Set(['events'])],
        ['tableId', new Set(['summary'])],
      ]),
    );
  });

  test('are none for a path without parameters, or with no name beside them', () => {
    expect(namesBeside(['/lanes/list'], ['/lanes/:id'])).toEqual(new Map());
    expect(namesBeside(['/lanes/:id'], ['/lanes/:slug/x', '/other/list'])).toEqual(new Map());
  });

  test('leave out a name of a route on the side of another name above it', () => {
    expect(namesBeside(['/lanes/extra/:id'], ['/lanes/:slug/list'])).toEqual(new Map());
    expect(namesBeside(['/lanes/:slug/list'], ['/lanes/extra/:id'])).toEqual(
      new Map([['slug', new Set(['extra'])]]),
    );
  });

  test('leave out text beside a parameter, which is no parameter alone', () => {
    expect(namesBeside(['/files/:name.json'], ['/files/index.json'])).toEqual(new Map());
  });

  test('take a parameter in quotes by its name, and one in a part that may be left out', () => {
    expect(namesBeside(['/lanes{/:"lane id"}'], ['/lanes/list'])).toEqual(
      new Map([['lane id', new Set(['list'])]]),
    );
  });

  test('leave out the names of the routes they are told to, but one another route spells too', () => {
    const others = routeTree([
      ['own', '/lanes/list'],
      ['own', '/lanes/extra/x'],
      ['other', '/lanes/extra/y'],
    ]);
    expect(namesIn(['/lanes/:id'], others, (owner) => owner === 'own')).toEqual(
      new Map([['id', new Set(['extra'])]]),
    );
  });
});
