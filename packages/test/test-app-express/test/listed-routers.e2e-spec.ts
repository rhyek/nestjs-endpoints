import {
  type CallHandler,
  type CanActivate,
  type ExecutionContext,
  Headers,
  type INestApplication,
  Injectable,
  type NestInterceptor,
  type Type,
} from '@nestjs/common';
import { decorated, EndpointRouter, z } from 'nestjs-endpoints';
import { map } from 'rxjs';
import request from 'supertest';
import { appWith, namesFirst } from './app-with';

// A router another lists in `routers`, over HTTP: where it is, and what the router that lists
// it gives its endpoints and runs for them.

/** What ran for a request, in order. */
const ran: string[] = [];

@Injectable()
class Tenants {
  nameOf(id: string) {
    return `tenant ${id}`;
  }
}

@Injectable()
class ListingGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    ran.push('listing guard');
    // Refuses a request that says so, for a route of either router.
    const { headers } = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    return !headers['x-refuse'];
  }
}

@Injectable()
class ListedGuard implements CanActivate {
  canActivate() {
    ran.push('listed guard');
    return true;
  }
}

@Injectable()
class ListingInterceptor implements NestInterceptor {
  intercept(_: ExecutionContext, next: CallHandler) {
    ran.push('listing interceptor');
    return next.handle().pipe(map((body: object) => ({ ...body, through: 'listing' })));
  }
}

const middleware = (name: string) => (_req: unknown, _res: unknown, next: () => void) => {
  ran.push(`${name} middleware`);
  next();
};

/** A library's router, with a router of its own made with its `child()`. */
function library() {
  // A folder with nothing in it: every endpoint here is listed.
  const shared = EndpointRouter.create({
    rootDirectory: './none',
    basePath: 'shared',
    middleware: [middleware('listed')],
    guards: [ListedGuard],
    expects: { tenants: EndpointRouter.given<Tenants>(), tenant: EndpointRouter.given<string>() },
    endpoints: (): Type[] => [view, rename],
  });
  const view = shared.endpoint.query({
    path: 'items/:itemId/view',
    method: 'get',
    params: z.object({ itemId: z.coerce.number() }),
    output: z.object({ item: z.number(), clinic: z.number(), tenant: z.string() }).loose(),
    handler: ({ params, tenants, tenant }) => ({
      item: params.itemId,
      // The path parameter of the router that lists this one, which it validates.
      clinic: (params as unknown as { clinicId: number }).clinicId,
      tenant: tenants.nameOf(tenant),
    }),
  });
  const rename = shared.endpoint.mutation({
    path: 'items/:itemId/rename',
    params: z.object({ itemId: z.coerce.number() }),
    input: z.object({ name: z.string().min(1) }),
    output: { 200: z.object({ name: z.string() }).loose(), 409: z.object({ taken: z.boolean() }) },
    handler: ({ input, response }) =>
      input.name === 'taken' ? response(409, { taken: true }) : response(200, { name: input.name }),
  });
  // With no base path of its own, it is where the router it is a child of is.
  const audit = shared.child({ rootDirectory: './none', endpoints: (): Type[] => [log] });
  const log = audit.endpoint.query({
    path: 'audit/log',
    method: 'get',
    output: z.object({ tenant: z.string() }).loose(),
    handler: ({ tenants, tenant }) => ({ tenant: tenants.nameOf(tenant) }),
  });
  return { shared, audit };
}

describe('a router another lists in `routers`, over HTTP', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const { shared, audit } = library();
    const listing = EndpointRouter.create({
      endpoints: [],
      basePath: 'clinics/:clinicId',
      providers: [Tenants],
      context: {
        params: z.object({ clinicId: z.coerce.number() }),
        inject: { tenants: Tenants },
        injectOnRequest: { tenant: decorated<string>(Headers('x-tenant')) },
      },
      middleware: [middleware('listing'), { exclude: ['common/items/:itemId/rename'] }],
      guards: [ListingGuard],
      interceptors: [ListingInterceptor],
      routers: [shared.register({ basePath: 'common' })],
    });
    ({ app } = await appWith([listing, audit], { options: namesFirst }));
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    ran.length = 0;
  });

  const call = (method: 'get' | 'post', url: string) =>
    request(app.getHttpServer())[method](url).set('x-tenant', 'acme');

  test('is served under the base path of the router that lists it, and nowhere else', async () => {
    await call('get', '/clinics/7/common/items/3/view').expect(200);
    await call('get', '/common/items/3/view').expect(404);
    await call('get', '/clinics/7/shared/items/3/view').expect(404);
    await call('get', '/shared/items/3/view').expect(404);
  });

  test('has the provider, the request value and the path parameter that router gives', async () => {
    const response = await call('get', '/clinics/7/common/items/3/view').expect(200);
    expect(response.body).toEqual({
      item: 3,
      clinic: 7,
      tenant: 'tenant acme',
      through: 'listing',
    });
  });

  test("runs that router's middleware, guard and interceptor before its own", async () => {
    await call('get', '/clinics/7/common/items/3/view').expect(200);
    expect(ran).toEqual([
      'listing middleware',
      'listed middleware',
      'listing guard',
      'listed guard',
      'listing interceptor',
    ]);
  });

  test("is refused by that router's guard", async () => {
    await call('get', '/clinics/7/common/items/3/view').set('x-refuse', 'yes').expect(403);
    expect(ran).not.toContain('listed guard');
  });

  test("has that router's path parameter validated, as its own is", async () => {
    const ofListing = await call('get', '/clinics/seven/common/items/3/view').expect(400);
    expect(ofListing.body.errors[0].path).toEqual(['clinicId']);
    const ofItsOwn = await call('get', '/clinics/7/common/items/three/view').expect(400);
    expect(ofItsOwn.body.errors[0].path).toEqual(['itemId']);
  });

  test("is left out of that router's middleware where its `exclude` says, by a path under it", async () => {
    await call('post', '/clinics/7/common/items/3/rename').send({ name: 'new' }).expect(200);
    expect(ran).toEqual([
      'listed middleware',
      'listing guard',
      'listed guard',
      'listing interceptor',
    ]);
  });

  test('answers each status of its output map', async () => {
    const renamed = await call('post', '/clinics/7/common/items/3/rename').send({ name: 'new' });
    expect([renamed.status, renamed.body]).toEqual([200, { name: 'new', through: 'listing' }]);
    const taken = await call('post', '/clinics/7/common/items/3/rename').send({ name: 'taken' });
    expect([taken.status, taken.body.taken]).toEqual([409, true]);
  });

  test('gives the same to a router made with its `child()`, which an app loads beside it', async () => {
    const response = await call('get', '/clinics/7/common/audit/log').expect(200);
    expect(response.body).toEqual({ tenant: 'tenant acme', through: 'listing' });
    expect(ran).toEqual([
      'listing middleware',
      'listed middleware',
      'listing guard',
      'listed guard',
      'listing interceptor',
    ]);
  });
});
