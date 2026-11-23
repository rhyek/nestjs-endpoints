import { INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EndpointRouter, NestjsEndpoints } from 'nestjs-endpoints';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import misnestedRouter from '../src/misnested/router.module';
import misplacedRouter from '../src/misplaced/router.module';
import tablesRouter from '../src/venues/$venueId/tables/router';
import { VenuesService } from '../src/venues/venues.service';
import { appWith } from './app-with';

const venueId = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';

describe('what a router gives the endpoints under it', () => {
  let app: INestApplication;
  let req: ReturnType<typeof request>;
  beforeAll(async () => {
    ({ app } = await appWith([AppModule]));
    req = request(app.getHttpServer());
  });
  afterAll(async () => {
    await app.close();
  });

  test('an endpoint has the params of its router, and declares none', async () => {
    await req
      .post(`/venues/${venueId}/view`)
      .set('x-tenant', 't1')
      .expect(200, { venueId, venue: 'venue 3f2b8c1e', tenant: 't1' });
  });

  test("a request that fails the router's params is a 400", async () => {
    const { body } = await req.post('/venues/not-a-uuid/view').expect(400);
    expect(body.errors).toMatchObject([{ path: ['venueId'] }]);
  });

  test('a router in a folder that names a path parameter applies its middleware, made with a provider of its parent', async () => {
    await req.post(`/venues/${venueId}/view`).expect('x-venue-scope', 'venue');
    const list = await req.post('/venues/list').expect(200);
    expect(list.headers).not.toHaveProperty('x-venue-scope');
  });

  test("a router's middleware runs once for its own endpoints and for those of every router under it", async () => {
    const paths = [
      // Its own, beside a child router in a folder that names a path parameter.
      '/venues/list',
      `/venues/${venueId}/view`,
      `/venues/${venueId}/tables/7/view`,
      // Of a router under it made with `create()`.
      '/venues/events/5/view',
    ];
    for (const path of paths) {
      await req.post(path).expect('x-venues-runs', '1');
    }
  });

  test('the middleware of a router in a folder that names a path parameter is not for the endpoints beside that folder', async () => {
    // Both are URLs `/venues/:venueId/…` matches too: a router's, and an endpoint file's
    // with two segments in its name.
    for (const path of ['/venues/events/5/view', '/venues/reports/summary']) {
      const beside = await req.post(path).expect(200).expect('x-venues-runs', '1');
      expect(beside.headers).not.toHaveProperty('x-venue-scope');
    }
    // A venue's own URL still has it.
    await req.post(`/venues/${venueId}/view`).expect('x-venue-scope', 'venue');
  });

  test("a router's middleware runs for every URL under its base path, whether an endpoint serves it or not", async () => {
    await req.post('/venues/nothing/here').expect(404).expect('x-venues-runs', '1');
  });

  test("a router's middleware runs whatever the method of the request", async () => {
    // `/venues/list` is a POST endpoint.
    for (const send of [() => req.options('/venues/list'), () => req.put('/venues/list')]) {
      await send().expect('x-venues-runs', '1');
    }
  });

  test('and not for a route it leaves out, which a router under it serves, with its own middleware', async () => {
    const seat = await req.post(`/venues/${venueId}/tables/7/seat/3`).expect(200);
    expect(seat.headers).not.toHaveProperty('x-venues-runs');
    // The middleware of the router between them is not left out with it.
    expect(seat.headers).toHaveProperty('x-venue-scope', 'venue');
  });

  test('a grandchild has the context of every router above it, its own winning', async () => {
    await req
      .post(`/venues/${venueId}/tables/7/view`)
      .set('x-tenant', 'of-venues')
      .set('x-table-tenant', 'of-tables')
      .expect(200, { venueId, tableId: 7, venue: 'venue 3f2b8c1e', tenant: 'of-tables' });
  });

  test('the guard of a child router is made with a provider of a router above it', async () => {
    await req.post(`/venues/${venueId}/tables/7/view`).set('x-party', 'banned').expect(403);
    await req.post(`/venues/${venueId}/view`).set('x-party', 'banned').expect(200);
  });

  test('a child router an app loads by itself has the providers of the routers above it', async () => {
    const fixture = await Test.createTestingModule({ imports: [tablesRouter] }).compile();
    const { default: view } = await import('../src/venues/$venueId/tables/$tableId/view.endpoint');
    await expect(
      fixture.get(view, { strict: false }).invoke({ params: { venueId, tableId: '7' } }),
    ).resolves.toMatchObject({ venue: 'venue 3f2b8c1e' });
  });

  test('a test overrides a provider and a module of a router with child routers', async () => {
    class Db {
      readonly name: string = 'real';
    }
    @Module({ providers: [Db], exports: [Db] })
    class DbModule {}
    @Module({ providers: [{ provide: Db, useValue: { name: 'fake' } }], exports: [Db] })
    class FakeDbModule {}
    const nowhere = { rootDirectory: '/nowhere' };
    const parent = EndpointRouter.create({
      ...nowhere,
      imports: [DbModule],
      providers: [VenuesService],
    });
    const child = parent.child({
      ...nowhere,
      providers: [
        {
          provide: 'seen',
          useFactory: (db: Db, venues: VenuesService) => [db.name, venues.scope],
          inject: [Db, VenuesService],
        },
      ],
    });
    const fixture = await Test.createTestingModule({
      imports: [NestjsEndpoints.forRoot(), parent, child],
    })
      .overrideModule(DbModule)
      .useModule(FakeDbModule)
      .overrideProvider(VenuesService)
      .useValue({ scope: 'fake venue' })
      .compile();
    expect(fixture.get('seen', { strict: false })).toEqual(['fake', 'fake venue']);
  });

  test('an endpoint has its properties, its methods and what its router injects on `this`', async () => {
    const visit = (name: string) => req.post('/venues/visit').send({ name });
    const opened = ['venues', 'tables'];
    await visit('arena').expect(200, {
      name: 'arena',
      visits: 1,
      known: true,
      ready: true,
      opened,
    });
    await visit('arena').expect(200, {
      name: 'arena',
      visits: 2,
      known: true,
      ready: true,
      opened,
    });
    await visit('pier').expect(200, { name: 'pier', visits: 1, known: false, ready: true, opened });
  });

  test("a router's lifecycle hooks run once, with what it and the routers above it inject", () => {
    expect(app.get(VenuesService, { strict: false }).opened).toEqual(['venues', 'tables']);
  });

  test('an endpoint a test instantiates has its properties and methods', async () => {
    const { default: visit } = await import('../src/venues/visit.endpoint');
    const fixture = await Test.createTestingModule({
      controllers: [visit],
      providers: [VenuesService],
    }).compile();
    const endpoint = fixture.get(visit);
    expect(endpoint.count('hall')).toBe(1);
    await expect(endpoint.invoke({ name: 'hall' })).resolves.toMatchObject({
      visits: 2,
      known: true,
    });
    expect([...endpoint.visits]).toEqual([['hall', 2]]);
    endpoint.count('arena');
    expect(endpoint.busiest).toBe('hall');
  });

  test("an endpoint's own params add to its routers', and win for a key both declare", async () => {
    await req
      .post(`/venues/${venueId}/tables/7/seat/3`)
      .expect(200, { venueId, tableId: '7', seat: 3 });
    await req.post('/venues/not-a-uuid/tables/7/seat/3').expect(400);
  });

  test('a router declares the params of a folder under it, with no child router', async () => {
    // Made with `create()` under the venues router: it inherits nothing.
    await req.post('/venues/events/5/view').expect(200, { eventId: 5, inherited: [] });
    await req.post('/venues/events/five/view').expect(400);
  });

  test('invoke() takes the merged params, with only the providers of the endpoint', async () => {
    // Imported once the app is built: an endpoint file evaluated outside any
    // router keeps the default path it is given then.
    const { default: view } = await import('../src/venues/$venueId/tables/$tableId/view.endpoint');
    const fixture = await Test.createTestingModule({
      controllers: [view],
      providers: [VenuesService],
    }).compile();
    await expect(fixture.get(view).invoke({ params: { venueId, tableId: '7' } })).resolves.toEqual({
      venueId,
      tableId: 7,
      venue: 'venue 3f2b8c1e',
      tenant: undefined,
    });
    // @ts-expect-error `venueId`, from two routers up, is required
    void (() => fixture.get(view).invoke({ params: { tableId: '7' } }));
  });

  test('the handler is typed with what every level gives', () => {
    tablesRouter.endpoint.query({
      path: 'types-only',
      handler: ({ params, venues, tenant }) => {
        expectTypeOf(params).toEqualTypeOf<{ venueId: string; tableId: number }>();
        expectTypeOf(venues).toEqualTypeOf<VenuesService>();
        expectTypeOf(tenant).toEqualTypeOf<string | undefined>();
        return null;
      },
    });
  });
});

describe('a router whose context cannot hold', () => {
  test('fails startup when it is a child nested under another router', async () => {
    await expect(
      Test.createTestingModule({ imports: [misnestedRouter] }).compile(),
    ).rejects.toThrow(
      /misnested[/\\]lost[/\\]router\.module[\s\S]*venues[/\\]router\.ts[\s\S]*misnested[/\\]router\.module/,
    );
  });

  test('fails startup when the URL of an endpoint lacks a param it declares', async () => {
    await expect(
      Test.createTestingModule({ imports: [misplacedRouter] }).compile(),
    ).rejects.toThrow(
      /misplaced[/\\]list\.endpoint[\s\S]*`venueId`[\s\S]*\/misplaced\/list[\s\S]*misplaced[/\\]router\.module/,
    );
  });
});
