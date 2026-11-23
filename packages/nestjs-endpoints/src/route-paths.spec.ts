import {
  Controller,
  Get,
  Post,
  RequestMethod,
  Version,
  VERSION_NEUTRAL,
  VersioningType,
} from '@nestjs/common';
import { isUnder, routesOf, underBase, underPattern, unversionedVersion } from './route-paths';

describe('the one pattern a router applies its middleware to', () => {
  test.each([
    ['venues', 'venues{/*path}'],
    ['venues/:venueId', 'venues/:venueId{/*path}'],
    ['/venues/', 'venues{/*path}'],
    // A router at the root: every URL.
    ['', '{*path}'],
    ['/', '{*path}'],
  ])('for the base path %j is %j: the base path, and every URL under it', (basePath, pattern) => {
    expect(underPattern(basePath)).toBe(pattern);
  });
});

const { GET, POST } = RequestMethod;

describe('the routes a controller has, as NestJS reads its decorators', () => {
  test('are its handlers’ paths under its own, with their methods', () => {
    @Controller('lanes')
    class Lanes {
      @Post('list')
      list() {}
      @Get()
      root() {}
      helper() {}
    }
    expect(routesOf(Lanes)).toEqual([
      { path: 'lanes/list', method: POST, version: undefined },
      { path: 'lanes', method: GET, version: undefined },
    ]);
  });

  test('are each path of each, where they have several', () => {
    @Controller(['a', 'b'])
    class Paths {
      @Get(['x', '/y/'])
      both() {}
    }
    expect(routesOf(Paths).map(({ path }) => path)).toEqual(['a/x', 'a/y', 'b/x', 'b/y']);
  });

  test('have the version of the controller, or of the handler where it has one', () => {
    @Controller({ path: 'v', version: '2' })
    class Versioned {
      @Get('a')
      a() {}
      @Version(['3', '4'])
      @Get('b')
      b() {}
    }
    expect(routesOf(Versioned)).toEqual([
      { path: 'v/a', method: GET, version: '2' },
      { path: 'v/b', method: GET, version: ['3', '4'] },
    ]);
  });

  test('leave its accessors alone, as NestJS does: a getter is not run on its prototype', () => {
    class Base {
      @Get('shadowed')
      shadowed() {}
    }
    @Controller('lanes')
    class Lanes extends Base {
      private readonly svc = { name: 'lanes' };
      get name() {
        return this.svc.name;
      }
      set only(_: string) {}
      @Get('list')
      list() {}
    }
    // A getter of the subclass hides the route of its base, for NestJS too.
    Object.defineProperty(Lanes.prototype, 'shadowed', { get: () => () => {} });
    expect(routesOf(Lanes)).toEqual([{ path: 'lanes/list', method: GET, version: undefined }]);
  });

  test('are none for a class that is not a controller', () => {
    class Plain {
      run() {}
    }
    expect(routesOf(Plain)).toEqual([]);
  });
});

describe('the versions an app serves a route without one under', () => {
  test('are none, and the default, with versions in its URLs and a default version', () => {
    expect(unversionedVersion({ type: VersioningType.URI, defaultVersion: '1' })).toEqual([
      VERSION_NEUTRAL,
      '1',
    ]);
    expect(unversionedVersion({ type: VersioningType.URI, defaultVersion: ['1', '2'] })).toEqual([
      VERSION_NEUTRAL,
      '1',
      '2',
    ]);
  });

  test('are not given otherwise: its URLs have none', () => {
    expect(unversionedVersion(undefined)).toBeUndefined();
    expect(unversionedVersion({ type: VersioningType.URI })).toBeUndefined();
    expect(
      unversionedVersion({ type: VersioningType.HEADER, header: 'v', defaultVersion: '1' }),
    ).toBeUndefined();
  });
});

describe('a path a router gives from its base path, as its `exclude` has them', () => {
  test.each([
    ['recipes', 'list', 'recipes/list'],
    ['recipes', '/list', 'recipes/list'],
    ['recipes', 'list/', 'recipes/list'],
    ['venues/:venueId', 'tables/:tableId/view', 'venues/:venueId/tables/:tableId/view'],
    // A router at the root.
    ['', 'list', 'list'],
    ['', '/list', 'list'],
  ])('under %j, %j is %j', (basePath, path, whole) => {
    expect(underBase(basePath, path)).toBe(whole);
  });
});

describe('whether a base path is under another', () => {
  test.each([
    ['venues/:venueId/tables', 'venues/:venueId', true],
    ['venues/:venueId', 'venues/:venueId', true],
    ['venues', '', true],
    ['venues/:venueId', 'venues/:placeId', false],
    ['venuesque/list', 'venues', false],
    ['other', 'venues', false],
    ['venues', 'venues/:venueId', false],
  ])('%j under %j: %s', (basePath, above, expected) => {
    expect(isUnder(basePath, above)).toBe(expected);
  });
});
